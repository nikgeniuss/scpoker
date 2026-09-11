import { nanoid } from 'nanoid';
import type {
  TournamentInfo, TournamentEntry, CreateTournamentOptions, BlindLevel, MttItmPercent, MttPayoutMode, BountyType,
  TournamentStandings, TournamentStructure, PromoCode,
} from '@poker-room/shared';
import type { GameManager } from '../GameManager.js';
import type { Card } from '../types.js';
import { buildBlindSchedule, currentLevelForElapsed, msUntilNextLevel, nextLevelBigBlind } from './tournamentSchedule.js';
import { computeSngPayout, computeMttPayout, computeGuaranteeOverlay, computeBountySplit, computeFinalPlaces, nextEliminationOrder } from './tournamentPayout.js';
import { planRebalanceMove, pickTableToClose, type TableSeats } from './tournamentBalancing.js';
import { readTournaments, writeTournaments } from './tournamentStorage.js';
import { readPromoCodes, writePromoCodes } from './promoCodeStorage.js';
import { tournamentBankroll } from './tournamentBankroll.js';
import { recordTournamentFinish } from './tournamentLedger.js';
import { recordTournamentTotals } from './tournamentPlayerTotals.js';
import { addProgress as addMissionProgress } from '../missionsService.js';
import { isBot } from '../botIdentity.js';
import { accrueTournamentRake as accrueBonusTournamentRake } from '../depositBonusService.js';
import { FILLER_BOT_ID_PREFIX } from '../botRepository.js';

type ServiceError = { error: string };

interface TournamentRuntime {
  info: TournamentInfo;
  schedule: BlindLevel[];
  blindTimer: NodeJS.Timeout | null;
  startTimer: NodeJS.Timeout | null; // авто-старт по scheduledStartAt (см. scheduleStartTimer)
  fillerBotTimers: NodeJS.Timeout[]; // отложенные попытки регистрации ботов-заполнителей (см. scheduleFillerBotAttempts) — гасятся в cancel()/finish()
  autoRemoveTimer: NodeJS.Timeout | null; // см. scheduleAutoRemove — гасится, если remove() вызван раньше вручную
  appliedLevel: number | null; // номер уровня, уже разосланного на столы (защита от повторной рассылки, см. scheduleBlindTimer)
}

// Оркестрация турниров (ROADMAP §10 «Турниры», SNG+MTT v1). Не трогает игровое ядро — создаёт/сажает/
// закрывает столы через публичные методы GameManager (createTournamentTable/seatTournamentPlayer/
// setTableBlinds/closeTournamentTable/movePlayerToTable) и подписывается на onTournamentBust для элиминации.
// Турнирные фишки — НЕ банкролл: бай-ин дебетуется один раз при регистрации (tournamentBankroll),
// призовые кредитуются один раз при завершении.
// SNG = MTT с одним столом (tableIds.length===1) — общие пути (блайнд-таймер/бaст/финиш) переиспользуются,
// балансировка/консолидация между столами включаются только когда tableIds.length>1.
export class TournamentManager {
  private tournaments = new Map<string, TournamentRuntime>();
  // Промокоды — глобальный реестр, НЕ часть tournaments (валидны по совпадению buyIn для любого
  // турнира, см. PromoCode в shared/index.ts), поэтому отдельное хранилище/persist.
  private promoCodes = new Map<string, PromoCode>();

  constructor(private gameManager: GameManager) {
    gameManager.onTournamentBust = (roomId, userId, killerIds) => this.handleBust(roomId, userId, killerIds);
    gameManager.onTournamentStacks = (roomId, stacks) => this.syncStacks(roomId, stacks);
    readPromoCodes().forEach(pc => this.promoCodes.set(pc.code, pc));
  }

  list(): TournamentInfo[] {
    return Array.from(this.tournaments.values()).map(t => t.info);
  }

  get(id: string): TournamentInfo | null {
    return this.tournaments.get(id)?.info ?? null;
  }

  listPromoCodes(): PromoCode[] {
    return Array.from(this.promoCodes.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  // Создание промокода в общем реестре (валиден для любого турнира с этим buyIn, см. PromoCode) —
  // либо автоматически из create() (promoEnabled), либо отдельно из админ-вкладки «Промокоды»
  // (массовая раздача не привязана к конкретному турниру, напр. подарки в Telegram-группе).
  createPromoCode(buyIn: number, maxRedemptions: number, createdBy: string): PromoCode | ServiceError {
    if (!Number.isInteger(buyIn) || buyIn < 0) return { error: 'invalid-buyin' };
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000) {
      return { error: 'invalid-max-redemptions' };
    }
    const code = this.generatePromoCodeString();
    const promo: PromoCode = { code, buyIn, maxRedemptions, redeemedBy: [], active: true, createdBy, createdAt: Date.now() };
    this.promoCodes.set(code, promo);
    this.persistPromoCodes();
    console.log(`🎟️ [promo-create] "${code}" buyIn=${buyIn} лимит=${maxRedemptions} (${createdBy})`);
    return promo;
  }

  deactivatePromoCode(code: string): PromoCode | ServiceError {
    const promo = this.promoCodes.get(code);
    if (!promo) return { error: 'not-found' };
    promo.active = false;
    this.persistPromoCodes();
    console.log(`🎟️ [promo-deactivate] "${code}"`);
    return promo;
  }

  // Окно, в котором повторный запрос на создание считается двойным submit'ом, а не намеренным
  // вторым турниром с тем же названием.
  private static readonly CREATE_DEDUP_WINDOW_MS = 5000;

  // Свежесозданный турнир того же админа с теми же ключевыми параметрами (см. create).
  private findRecentDuplicate(opts: CreateTournamentOptions, createdBy: string): TournamentInfo | null {
    const now = Date.now();
    const name = opts.name.trim().slice(0, 60);
    for (const t of this.tournaments.values()) {
      const i = t.info;
      if (i.status !== 'registering' || i.createdBy !== createdBy) continue;
      if (i.name !== name || i.type !== opts.type) continue;
      if (i.buyIn !== opts.buyIn || i.startingStack !== opts.startingStack || i.tableSize !== opts.tableSize) continue;
      if (now - i.createdAt <= TournamentManager.CREATE_DEDUP_WINDOW_MS) return i;
    }
    return null;
  }

  create(opts: CreateTournamentOptions, createdBy: string): TournamentInfo | ServiceError {
    if (opts.type !== 'sng' && opts.type !== 'mtt') return { error: 'invalid-type' };
    if (!opts.name || !opts.name.trim()) return { error: 'name-required' };
    if (!Number.isInteger(opts.buyIn) || opts.buyIn < 0) return { error: 'invalid-buyin' };
    if (!Number.isInteger(opts.startingStack) || opts.startingStack <= 0) return { error: 'invalid-starting-stack' };
    // startingBigBlind — явный выбор админа (степпер по BLIND_LADDER в CreateTournamentModal.tsx).
    // Опционально: старые вызовы (тесты/скрипты) без этого поля получают прежнее поведение —
    // стартовый блайнд выводится из стартового стека (~75bb).
    if (opts.startingBigBlind !== undefined && (!Number.isInteger(opts.startingBigBlind) || opts.startingBigBlind <= 0)) {
      return { error: 'invalid-starting-big-blind' };
    }
    const startingBigBlind = opts.startingBigBlind ?? Math.max(10, Math.round(opts.startingStack / 75));
    if (!Number.isInteger(opts.tableSize) || opts.tableSize < 2 || opts.tableSize > 9) return { error: 'invalid-table-size' };

    // Защита от двойного submit: живой прогон 2026-09-02 двойным кликом создал два одинаковых MTT
    // с разницей 514 мс — оба набрали игроков, доиграли и КАЖДЫЙ выплатил гарантию. Повторный
    // запрос с теми же ключевыми параметрами в пределах окна отдаёт уже созданный турнир
    // (идемпотентно), а не второй такой же.
    const duplicate = this.findRecentDuplicate(opts, createdBy);
    if (duplicate) {
      console.log(`🏅 [tournament-create-dedup] повторный запрос "${duplicate.name}" (id=${duplicate.id}) в пределах ${TournamentManager.CREATE_DEDUP_WINDOW_MS}мс — отдан существующий`);
      return duplicate;
    }
    if (!Number.isInteger(opts.levelUpMinutes) || opts.levelUpMinutes < 1 || opts.levelUpMinutes > 60) {
      return { error: 'invalid-level-minutes' };
    }
    const lateRegMinutes = opts.type === 'mtt' ? (opts.lateRegMinutes ?? 0) : 0;
    if (!Number.isInteger(lateRegMinutes) || lateRegMinutes < 0 || lateRegMinutes > 120) {
      return { error: 'invalid-late-reg' };
    }

    // Границы по числу уникальных игроков (MTT-only — SNG уже ограничен tableSize, см. TournamentInfo).
    let minPlayers: number | undefined;
    let maxPlayers: number | undefined;
    if (opts.type === 'mtt') {
      if (opts.minPlayers !== undefined) {
        if (!Number.isInteger(opts.minPlayers) || opts.minPlayers < 2) return { error: 'invalid-min-players' };
        minPlayers = opts.minPlayers;
      }
      if (opts.maxPlayers !== undefined) {
        if (!Number.isInteger(opts.maxPlayers) || opts.maxPlayers < 2) return { error: 'invalid-max-players' };
        if (minPlayers !== undefined && opts.maxPlayers < minPlayers) return { error: 'max-players-below-min' };
        maxPlayers = opts.maxPlayers;
      }
    }
    const itmPercent = opts.type === 'mtt' ? (opts.itmPercent ?? 15) : 100 as MttItmPercent;
    if (opts.type === 'mtt' && (!Number.isInteger(itmPercent) || itmPercent < 1 || itmPercent > 100)) {
      return { error: 'invalid-itm-percent' };
    }

    const payoutMode: MttPayoutMode = opts.type === 'mtt' ? (opts.payoutMode ?? 'itm') : 'itm';
    if (payoutMode !== 'itm' && payoutMode !== 'fixed') return { error: 'invalid-payout-mode' };
    let fixedPayoutPlaces: number | undefined;
    if (opts.type === 'mtt' && payoutMode === 'fixed') {
      const places = opts.fixedPayoutPlaces;
      if (typeof places !== 'number' || !Number.isInteger(places) || places < 1 || places > 1000) {
        return { error: 'invalid-fixed-payout-places' };
      }
      fixedPayoutPlaces = places;
    }

    // Форма распределения приза между местами (MTT) — вес места = 1/place^exponent (см. tournamentPayout.ts).
    let payoutCurveExponent: number | undefined;
    if (opts.type === 'mtt' && opts.payoutCurveExponent !== undefined) {
      if (typeof opts.payoutCurveExponent !== 'number' || !Number.isFinite(opts.payoutCurveExponent) ||
          opts.payoutCurveExponent < 0.1 || opts.payoutCurveExponent > 5) {
        return { error: 'invalid-payout-curve-exponent' };
      }
      payoutCurveExponent = opts.payoutCurveExponent;
    }

    // Рейк (SNG+MTT) — доля бай-ина мимо призового фонда.
    let rakePercent: number | undefined;
    if (opts.rakePercent !== undefined) {
      if (!Number.isInteger(opts.rakePercent) || opts.rakePercent < 0 || opts.rakePercent > 50) {
        return { error: 'invalid-rake-percent' };
      }
      rakePercent = opts.rakePercent > 0 ? opts.rakePercent : undefined;
    }

    // Промокод на бесплатный вход (SNG+MTT) — валидируем здесь, САМ код генерируем ниже (после всех
    // остальных проверок), чтобы неудачное создание турнира по другой причине не оставляло сиротский
    // промокод в общем реестре.
    let promoMaxRedemptions: number | undefined;
    if (opts.promoEnabled) {
      promoMaxRedemptions = opts.promoMaxRedemptions ?? 0;
      if (!Number.isInteger(promoMaxRedemptions) || promoMaxRedemptions < 1 || promoMaxRedemptions > 1000) {
        return { error: 'invalid-promo-max-redemptions' };
      }
    }

    const reEntryEnabled = opts.type === 'mtt' ? !!opts.reEntryEnabled : false;
    let maxReEntries: number | undefined;
    let unlimitedReEntries: boolean | undefined;
    let reEntryFee: number | undefined;
    if (reEntryEnabled) {
      unlimitedReEntries = !!opts.unlimitedReEntries;
      if (!unlimitedReEntries) {
        const mr = opts.maxReEntries ?? 1;
        if (!Number.isInteger(mr) || mr < 1 || mr > 10) return { error: 'invalid-max-reentries' };
        maxReEntries = mr;
      }
      reEntryFee = opts.reEntryFee ?? opts.buyIn;
      if (!Number.isInteger(reEntryFee) || reEntryFee < 0) return { error: 'invalid-reentry-fee' };
    }

    let guaranteedPrizePool: number | undefined;
    if (opts.type === 'mtt' && opts.guaranteedPrizePool !== undefined) {
      if (!Number.isInteger(opts.guaranteedPrizePool) || opts.guaranteedPrizePool < 0) {
        return { error: 'invalid-guaranteed-prize-pool' };
      }
      guaranteedPrizePool = opts.guaranteedPrizePool > 0 ? opts.guaranteedPrizePool : undefined;
    }

    const bountyEnabled = !!opts.bountyEnabled;
    let bountyType: BountyType | undefined;
    let bountyPercent: number | undefined;
    if (bountyEnabled) {
      bountyType = opts.bountyType === 'progressive' ? 'progressive' : 'flat';
      bountyPercent = opts.bountyPercent ?? 50;
      if (!Number.isInteger(bountyPercent) || bountyPercent < 1 || bountyPercent > 90) {
        return { error: 'invalid-bounty-percent' };
      }
    }

    // Расписание старта (ROADMAP §10.19) — оба поля опциональны, timestamp мс.
    let regOpensAt: number | undefined;
    if (opts.regOpensAt !== undefined) {
      if (!Number.isInteger(opts.regOpensAt) || opts.regOpensAt <= 0) return { error: 'invalid-reg-opens-at' };
      regOpensAt = opts.regOpensAt;
    }
    let scheduledStartAt: number | undefined;
    if (opts.scheduledStartAt !== undefined) {
      if (!Number.isInteger(opts.scheduledStartAt) || opts.scheduledStartAt <= 0) return { error: 'invalid-scheduled-start-at' };
      if (regOpensAt !== undefined && opts.scheduledStartAt < regOpensAt) return { error: 'scheduled-start-before-reg-opens' };
      scheduledStartAt = opts.scheduledStartAt;
    }

    // Незаметное заполнение ботами (roadmap 2026-07-09) — см. scheduleEarlyFillerBots/
    // scheduleLateFillerBots/tryRegisterFillerBot ниже. Боты платят бай-ин/баунти как обычный
    // участник (решение пользователя) — единственное отличие от register(): без bankroll-списания
    // (источник — house, тот же принцип, что и guarantee-оверлей) и никогда не заходят повторно.
    const fillWithBots = !!opts.fillWithBots;
    let botFillTarget: number | undefined;
    if (fillWithBots) {
      const target = opts.botFillTarget ?? 0;
      if (!Number.isInteger(target) || target < 1 || target > 100) return { error: 'invalid-bot-fill-target' };
      botFillTarget = target;
    }

    // Промокод создаём здесь — после всех остальных проверок, чтобы не оставить сиротский код в
    // реестре, если create() дальше всё же откажет по другой причине (тут дальше отказов нет).
    let promoCode: string | undefined;
    if (opts.promoEnabled && promoMaxRedemptions !== undefined) {
      const promo = this.createPromoCode(opts.buyIn, promoMaxRedemptions, createdBy);
      if ('error' in promo) return promo;
      promoCode = promo.code;
    }

    const id = nanoid(10);
    const info: TournamentInfo = {
      id,
      name: opts.name.trim().slice(0, 60),
      type: opts.type,
      format: opts.format === 'shortdeck' ? 'shortdeck' : 'nlh',
      status: 'registering',
      buyIn: opts.buyIn,
      startingStack: opts.startingStack,
      startingBigBlind,
      tableSize: opts.tableSize,
      blindSpeed: opts.blindSpeed,
      levelUpMinutes: opts.levelUpMinutes,
      prizePool: 0,
      entries: [],
      tableIds: [],
      lateRegMinutes,
      minPlayers,
      maxPlayers,
      itmPercent,
      payoutMode,
      fixedPayoutPlaces,
      payoutCurveExponent,
      reEntryEnabled,
      maxReEntries,
      unlimitedReEntries,
      reEntryFee,
      guaranteedPrizePool,
      rakePercent,
      promoCode,
      bountyEnabled,
      bountyType,
      bountyPercent,
      regOpensAt,
      scheduledStartAt,
      fillWithBots,
      botFillTarget,
      createdBy,
      createdAt: Date.now(),
    };
    this.tournaments.set(id, { info, schedule: buildBlindSchedule(startingBigBlind, opts.levelUpMinutes), blindTimer: null, startTimer: null, fillerBotTimers: [], autoRemoveTimer: null, appliedLevel: null });
    this.persist();
    console.log(`🏅 [tournament-create] "${info.name}" (${info.id}, ${info.type}) buyIn=${info.buyIn} startStack=${info.startingStack} startBB=${startingBigBlind} tableSize=${info.tableSize} speed=${info.blindSpeed} levelUp=${info.levelUpMinutes}м${bountyEnabled ? ` bounty=${bountyType}/${bountyPercent}%` : ''}${guaranteedPrizePool ? ` guarantee=${guaranteedPrizePool}` : ''}${reEntryEnabled ? ` reEntry(max=${unlimitedReEntries ? '∞' : maxReEntries}, fee=${reEntryFee})` : ''}${rakePercent ? ` rake=${rakePercent}%` : ''}${promoCode ? ` promo=${promoCode}(x${promoMaxRedemptions})` : ''}${payoutCurveExponent !== undefined ? ` curve=${payoutCurveExponent}` : ''}${regOpensAt ? ` regOpensAt=${new Date(regOpensAt).toISOString()}` : ''}${scheduledStartAt ? ` scheduledStartAt=${new Date(scheduledStartAt).toISOString()}` : ''}${fillWithBots ? ` fillBots=${botFillTarget}` : ''}${minPlayers !== undefined ? ` minPlayers=${minPlayers}` : ''}${maxPlayers !== undefined ? ` maxPlayers=${maxPlayers}` : ''}`);
    if (scheduledStartAt) this.scheduleStartTimer(id);
    if (fillWithBots) this.scheduleEarlyFillerBots(id);
    return info;
  }

  // Отмена турнира — до старта (обычный путь) ИЛИ во время running (принудительный абort, для
  // зависших/тестовых турниров, roadmap 2026-07-03). Бай-ины возвращаются всем entries (включая
  // уже выбывших — турнир аннулируется целиком, а не доигрывается), столы (если были) закрываются.
  cancel(id: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering' && t.info.status !== 'running') return { error: 'invalid-status' };
    const wasRunning = t.info.status === 'running';
    // Вход по промокоду не списывал банкролл — refund() дал бы такому игроку чипы, которые он не
    // платил (см. redeemPromoCode/unregister). Вместо этого освобождаем его слот погашения у кода.
    t.info.entries.forEach(e => {
      if (e.promoCode) {
        const promo = this.promoCodes.get(e.promoCode);
        if (promo) promo.redeemedBy = promo.redeemedBy.filter(u => u !== e.userId);
      } else {
        this.refund(e.userId, t.info.buyIn);
      }
    });
    this.persistPromoCodes();
    if (t.blindTimer) {
      clearTimeout(t.blindTimer);
      t.blindTimer = null;
    }
    if (t.startTimer) {
      clearTimeout(t.startTimer);
      t.startTimer = null;
    }
    t.fillerBotTimers.forEach(timer => clearTimeout(timer));
    t.fillerBotTimers = [];
    t.info.tableIds.forEach(roomId => this.gameManager.closeTournamentTable(roomId));
    t.info.tableIds = [];
    console.log(`🏅 [tournament-cancel] "${t.info.name}" (${t.info.id}${wasRunning ? ', был running — столы закрыты принудительно' : ''}) — возврат бай-инов ${t.info.entries.length} игрокам`);
    t.info.status = 'cancelled';
    t.info.finishedAt = Date.now();
    this.persist();
    this.scheduleAutoRemove(id);
    return t.info;
  }

  // Удаление из списка ЗАВЕРШЁННОГО/отменённого турнира (архивации пока нет, ROADMAP §9.5 —
  // список иначе засоряется тестовыми турнирами навсегда). registering/running трогать нельзя —
  // там реальные бай-ины и незавершённая игра, для них есть только cancel().
  remove(id: string): { ok: true } | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'finished' && t.info.status !== 'cancelled') return { error: 'invalid-status' };
    if (t.autoRemoveTimer) clearTimeout(t.autoRemoveTimer);
    this.tournaments.delete(id);
    console.log(`🏅 [tournament-remove] "${t.info.name}" (${t.info.id}, status=${t.info.status}) — убран из списка`);
    this.persist();
    return { ok: true };
  }

  // Автоудаление из списка (как у топ-румов — результат виден ограниченное время, потом лобби не
  // засоряется): finish()/cancel() ставят таймер на remove() этого же турнира. remove() сам
  // проверяет статус и no-op'ает, если админ уже удалил вручную раньше — двойного вызова не боимся.
  private static readonly AUTO_REMOVE_DELAY_MS = 30 * 60_000; // 30 минут

  private scheduleAutoRemove(id: string, delayMs: number = TournamentManager.AUTO_REMOVE_DELAY_MS): void {
    const t = this.tournaments.get(id);
    if (!t) return;
    if (t.autoRemoveTimer) clearTimeout(t.autoRemoveTimer);
    t.autoRemoveTimer = setTimeout(() => this.remove(id), Math.max(0, delayMs));
  }

  // Принудительный старт админом до заполнения стола (нужно ≥minPlayers зарегистрированных, MTT-only
  // настройка, по умолчанию 2). Для MTT — единственный способ старта (нет авто-старта по заполнению,
  // в отличие от SNG).
  // testDeck — опциональный параметр для тестов SNG (как GameManager.startGame), production-вызовы его не передают.
  forceStart(id: string, testDeck?: Card[]): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    const minPlayers = t.info.type === 'mtt' ? (t.info.minPlayers ?? 2) : 2;
    if (t.info.entries.length < minPlayers) return { error: 'not-enough-players' };
    console.log(`🏅 [tournament-force-start] admin принудительно стартовал "${t.info.name}" (${t.info.id}) (${t.info.entries.length} игроков)`);
    if (t.info.type === 'mtt') {
      this.startMtt(id);
    } else {
      this.start(id, testDeck);
    }
    return t.info;
  }

  // Добавляет N тестовых ботов (loose-passive, target='minus' — стабильно сливают стек) напрямую
  // в entries, МИНУЯ tournamentBankroll (боты в турнирах реальных денег не платят — решение
  // пользователя 2026-07-03). Только пока status==='registering'; для SNG capped местами за столом
  // и триггерит авто-старт при заполнении (как обычная регистрация).
  addBots(id: string, count: number): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    if (!Number.isInteger(count) || count < 1 || count > 50) return { error: 'invalid-bot-count' };

    let toAdd = count;
    if (t.info.type === 'sng') {
      const freeSeats = t.info.tableSize - t.info.entries.length;
      if (freeSeats <= 0) return { error: 'full' };
      toAdd = Math.min(count, freeSeats);
    }

    const bots = this.gameManager.getBotManager().createTestBots(toAdd, t.info.startingStack);
    bots.forEach((b) => {
      t.info.entries.push({ userId: b.id, username: b.username, status: 'registered' });
    });
    this.persist();
    console.log(`🏅 [tournament-add-bots] "${t.info.name}" (${t.info.id}) +${bots.length} тестовых ботов (target=minus, без бай-ина, entries=${t.info.entries.length})`);

    if (t.info.type === 'sng' && !t.info.scheduledStartAt && t.info.entries.length >= t.info.tableSize) {
      this.start(id);
    }
    return t.info;
  }

  // ===== Незаметное заполнение ботами (roadmap 2026-07-09) =====
  // Отличается от addBots() (ручной debug-инструмент, "Тестбот-XXXXX", видимый админ-триггер):
  // персоны с человеческими именами (tournamentFillerPersonas.ts), этапная авто-регистрация по
  // расписанию (не всё разом), платят бай-ин/баунти как обычный игрок (house-funded — тот же
  // принцип, что guarantee-оверлей), никогда не заходят повторно после вылета.

  // Разослать count попыток регистрации бота-заполнителя со случайной задержкой в [minDelayMs, maxDelayMs].
  // Хендлы сохраняются в t.fillerBotTimers — без этого cancel()/finish() не могли погасить ещё не
  // сработавшие попытки: таймер держит живой this (и весь TournamentManager) через замыкание и в
  // проде просто впустую тикает до срабатывания, а в тестах (реальные, не fake, таймеры — общий
  // event loop на весь прогон) может выстрелить много позже, во время СОВСЕМ ДРУГОГО теста, и
  // списать бай-ин с чужого userId, случайно совпавшего по имени ('A'/'B' переиспользуются почти
  // везде) — нашли по флейки-провалам при полном `npm run check` (2026-08-27).
  private scheduleFillerBotAttempts(id: string, count: number, minDelayMs: number, maxDelayMs: number): void {
    const t = this.tournaments.get(id);
    if (!t) return;
    const span = Math.max(0, maxDelayMs - minDelayMs);
    for (let i = 0; i < count; i++) {
      const delayMs = minDelayMs + Math.random() * span;
      const timer = setTimeout(() => this.tryRegisterFillerBot(id), delayMs);
      t.fillerBotTimers.push(timer);
    }
  }

  // Вызывается из create(): ~60% от цели (для SNG/турниров без поздней рег. — 100%) стартуют
  // случайно в первые минуты после открытия регистрации. Окно урезается под scheduledStartAt,
  // чтобы боты не пытались зайти уже ПОСЛЕ назначенного старта.
  private scheduleEarlyFillerBots(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || !t.info.fillWithBots || !t.info.botFillTarget) return;
    const total = t.info.botFillTarget;
    const hasLatePhase = t.info.type === 'mtt' && t.info.lateRegMinutes > 0;
    const earlyCount = hasLatePhase ? Math.max(1, Math.round(total * 0.6)) : total;

    const now = Date.now();
    const anchorDelay = Math.max(0, (t.info.regOpensAt ?? now) - now);
    let maxWindowMs = 8 * 60_000;
    if (t.info.scheduledStartAt) {
      maxWindowMs = Math.min(maxWindowMs, Math.max(5_000, t.info.scheduledStartAt - now - anchorDelay - 5_000));
    }
    const minWindowMs = Math.min(10_000, maxWindowMs);

    this.scheduleFillerBotAttempts(id, earlyCount, anchorDelay + minWindowMs, anchorDelay + maxWindowMs);
    console.log(`🏅 [tournament-fill-bots] "${t.info.name}" (${t.info.id}): запланировано ${earlyCount} бот(а)-заполнителя на регистрацию (цель=${total})`);
  }

  // Вызывается из startMtt(): что осталось от цели (не набралось на этапе registering — включая
  // недобор из-за раннего forceStart) стартует случайно в первые 85% окна поздней регистрации.
  private scheduleLateFillerBots(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || !t.info.fillWithBots || !t.info.botFillTarget) return;
    if (t.info.type !== 'mtt' || t.info.lateRegMinutes <= 0) return;
    const currentFillerCount = t.info.entries.filter(e => e.userId.startsWith(FILLER_BOT_ID_PREFIX)).length;
    const remaining = t.info.botFillTarget - currentFillerCount;
    if (remaining <= 0) return;
    const usableWindowMs = Math.max(5_000, t.info.lateRegMinutes * 60_000 * 0.85);
    this.scheduleFillerBotAttempts(id, remaining, 0, usableWindowMs);
    console.log(`🏅 [tournament-fill-bots] "${t.info.name}" (${t.info.id}): запланировано ${remaining} бот(а)-заполнителя на позднюю регистрацию`);
  }

  // Все bot:fill- id, сейчас занятые (registered/playing) в ЛЮБОМ активном турнире — чтобы одна
  // и та же персона не оказалась одновременно в двух турнирах.
  private activeFillerBotIds(): Set<string> {
    const ids = new Set<string>();
    for (const rt of this.tournaments.values()) {
      if (rt.info.status !== 'registering' && rt.info.status !== 'running') continue;
      for (const e of rt.info.entries) {
        if (e.userId.startsWith(FILLER_BOT_ID_PREFIX) && e.status !== 'eliminated') ids.add(e.userId);
      }
    }
    return ids;
  }

  // Одна попытка регистрации бота-заполнителя — вызывается из setTimeout'ов выше. Молча выходит
  // (без ошибки), если момент уже не подходит (турнир не в том статусе, окно закрылось, стол
  // полон, свободных персон нет) — это штатная ситуация, не все запланированные попытки обязаны
  // сработать (форс-старт раньше времени и т.п.).
  private tryRegisterFillerBot(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || !t.info.fillWithBots || !t.info.botFillTarget) return;
    const currentFillerCount = t.info.entries.filter(e => e.userId.startsWith(FILLER_BOT_ID_PREFIX)).length;
    if (currentFillerCount >= t.info.botFillTarget) return;

    if (t.info.status === 'registering') {
      if (t.info.regOpensAt && Date.now() < t.info.regOpensAt) return;
      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) return;
      if (t.info.type === 'mtt' && t.info.maxPlayers !== undefined && t.info.entries.length >= t.info.maxPlayers) return;
    } else if (t.info.status === 'running' && t.info.type === 'mtt' && t.info.startedAt) {
      const elapsed = Date.now() - t.info.startedAt;
      if (t.info.lateRegMinutes <= 0 || elapsed > t.info.lateRegMinutes * 60_000) return;
    } else {
      return;
    }

    const usedNames = new Set(t.info.entries.map(e => e.username));
    const reserved = this.activeFillerBotIds();
    const pool = this.gameManager.getBotManager().getFillerPersonaPool();
    const candidate = pool.find(b => !reserved.has(b.id) && !usedNames.has(b.username));
    if (!candidate) {
      console.log(`🏅 [tournament-fill-bots] "${t.info.name}" (${t.info.id}): свободных персон нет, пропуск`);
      return;
    }
    const bot = this.gameManager.getBotManager().prepareFillerBot(candidate.id, t.info.startingStack);
    if (!bot) return;

    const bounty = this.bountyPerEntry(t.info);
    const rake = this.rakePerEntry(t.info);

    if (t.info.status === 'registering') {
      t.info.entries.push({ userId: bot.id, username: bot.username, status: 'registered', ...(bounty > 0 ? { bounty } : {}) });
      this.creditEntryFee(t.info, t.info.buyIn, bounty, rake);
      this.persist();
      console.log(`🏅 [tournament-fill-bots] ${bot.username} → "${t.info.name}" (${t.info.id}) (рег., ${t.info.entries.length}${t.info.type === 'sng' ? `/${t.info.tableSize}` : ''})`);
      if (t.info.type === 'sng' && !t.info.scheduledStartAt && t.info.entries.length >= t.info.tableSize) {
        this.start(id);
      }
      return;
    }

    const tableId = this.seatOrOpenTable(t);
    this.gameManager.seatTournamentPlayer(tableId, bot.id, bot.username, t.info.startingStack);
    t.info.entries.push({ userId: bot.id, username: bot.username, status: 'playing', tableId, ...(bounty > 0 ? { bounty } : {}) });
    this.creditEntryFee(t.info, t.info.buyIn, bounty, rake);
    this.persist();
    console.log(`🏅 [tournament-fill-bots] ${bot.username} → "${t.info.name}" (${t.info.id}) (поздняя рег., стол=${tableId})`);
    this.gameManager.startGame(tableId);
    this.rebalanceTables(id);
  }

  register(id: string, userId: string, username: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    // Активная запись (ещё играет/в очереди на старт) блокирует повторный вход. Запись со
    // status==='eliminated' — НЕ блокирует: это прошлый бaст, через который проходит ре-энтри ниже.
    if (t.info.entries.some(e => e.userId === userId && e.status !== 'eliminated')) {
      return { error: 'already-registered' };
    }

    if (t.info.status === 'registering') {
      if (t.info.regOpensAt && Date.now() < t.info.regOpensAt) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): registration-not-open (откроется ${new Date(t.info.regOpensAt).toISOString()})`);
        return { error: 'registration-not-open' };
      }

      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): full`);
        return { error: 'full' };
      }
      if (t.info.type === 'mtt' && t.info.maxPlayers !== undefined && t.info.entries.length >= t.info.maxPlayers) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): full (maxPlayers=${t.info.maxPlayers})`);
        return { error: 'full' };
      }

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < t.info.buyIn) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): insufficient-bankroll (нужно ${t.info.buyIn}, есть ${bankroll})`);
        return { error: 'insufficient-bankroll' };
      }

      const bounty = this.bountyPerEntry(t.info);
      const rake = this.rakePerEntry(t.info);
      tournamentBankroll.persistChips(userId, bankroll - t.info.buyIn);
      t.info.entries.push({ userId, username, status: 'registered', ...(bounty > 0 ? { bounty } : {}) });
      this.creditEntryFee(t.info, t.info.buyIn, bounty, rake);
      this.persist();
      console.log(`🏅 [tournament-register] ${username} → "${t.info.name}" (${t.info.id}) (${t.info.entries.length}${t.info.type === 'sng' ? `/${t.info.tableSize}` : ''}) prizePool=${t.info.prizePool}`);

      if (t.info.type === 'sng' && !t.info.scheduledStartAt && t.info.entries.length >= t.info.tableSize) {
        this.start(id);
      }
      return t.info;
    }

    // Поздняя регистрация и ре-энтри (только MTT, в окне lateRegMinutes после старта). Ре-энтри —
    // это НОВАЯ отдельная запись entries, а не реюз старой: прошлый бaст уже финализирован своим
    // finishPlace в handleBust, новый вход — заново с полным стеком (как в реальных рум-турнирах).
    if (t.info.type === 'mtt' && t.info.status === 'running' && t.info.startedAt) {
      const elapsed = Date.now() - t.info.startedAt;
      if (t.info.lateRegMinutes <= 0 || elapsed > t.info.lateRegMinutes * 60_000) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): late-reg-closed (прошло ${Math.round(elapsed / 60_000)}м из ${t.info.lateRegMinutes}м)`);
        return { error: 'late-reg-closed' };
      }

      const priorEntries = t.info.entries.filter(e => e.userId === userId);
      const isReEntry = priorEntries.length > 0;
      if (isReEntry) {
        if (!t.info.reEntryEnabled) {
          console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): reentry-disabled`);
          return { error: 'reentry-disabled' };
        }
        if (!t.info.unlimitedReEntries && priorEntries.length > (t.info.maxReEntries ?? 0)) {
          console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): reentry-limit-reached (${priorEntries.length}/${t.info.maxReEntries})`);
          return { error: 'reentry-limit-reached' };
        }
      }
      const fee = isReEntry ? (t.info.reEntryFee ?? t.info.buyIn) : t.info.buyIn;

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < fee) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}" (${t.info.id}): insufficient-bankroll (нужно ${fee}, есть ${bankroll})`);
        return { error: 'insufficient-bankroll' };
      }

      const tableId = this.seatOrOpenTable(t);

      const bounty = this.bountyPerEntry(t.info);
      const rake = this.rakePerEntry(t.info);
      tournamentBankroll.persistChips(userId, bankroll - fee);
      this.gameManager.seatTournamentPlayer(tableId, userId, username, t.info.startingStack);
      t.info.entries.push({ userId, username, status: 'playing', tableId, ...(bounty > 0 ? { bounty } : {}) });
      this.creditEntryFee(t.info, fee, bounty, rake);
      accrueBonusTournamentRake(userId, rake);
      this.persist();
      console.log(`🏅 [tournament-register] ${username} → "${t.info.name}" (${t.info.id}) ${priorEntries.length > 0 ? '(ре-энтри) ' : '(поздняя рег.) '}стол=${tableId} prizePool=${t.info.prizePool}`);
      // Неровный сплит при старте MTT может оставить стол с 1 игроком (status='waiting',
      // startGame внутри startMtt молча вышел по players.size<2) — позднюю посадку нужно
      // довести до реальной раздачи. No-op, если стол уже playing/полон.
      this.gameManager.startGame(tableId);
      this.rebalanceTables(id);
      return t.info;
    }

    return { error: 'registration-closed' };
  }

  // Погашение промокода (см. createPromoCode) — та же логика входа, что register(), но БЕЗ
  // списания банкролла: рум платит бай-ин за игрока в prizePool (тот же принцип, что
  // guarantee-оверлей/fillWithBots). Только на ПЕРВЫЙ вход — ре-энтри после вылета код повторно
  // не покрывает (redeemedBy одноразовый на игрока, глобально по всем турнирам этого кода);
  // для ре-энтри — обычный register() за фишки.
  redeemPromoCode(id: string, userId: string, username: string, code: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.entries.some(e => e.userId === userId && e.status !== 'eliminated')) {
      return { error: 'already-registered' };
    }

    const promo = this.promoCodes.get(code);
    if (!promo || !promo.active) return { error: 'invalid-promo-code' };
    if (promo.buyIn !== t.info.buyIn) return { error: 'promo-buyin-mismatch' };
    if (promo.redeemedBy.length >= promo.maxRedemptions) return { error: 'promo-limit-reached' };
    if (promo.redeemedBy.includes(userId)) return { error: 'promo-already-used' };

    if (t.info.status === 'registering') {
      if (t.info.regOpensAt && Date.now() < t.info.regOpensAt) return { error: 'registration-not-open' };
      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) return { error: 'full' };
      if (t.info.type === 'mtt' && t.info.maxPlayers !== undefined && t.info.entries.length >= t.info.maxPlayers) {
        return { error: 'full' };
      }

      const bounty = this.bountyPerEntry(t.info);
      const rake = this.rakePerEntry(t.info);
      t.info.entries.push({ userId, username, status: 'registered', promoCode: code, ...(bounty > 0 ? { bounty } : {}) });
      this.creditEntryFee(t.info, t.info.buyIn, bounty, rake);
      promo.redeemedBy.push(userId);
      this.persistPromoCodes();
      this.persist();
      console.log(`🎟️ [promo-redeem] ${username} → "${t.info.name}" (${t.info.id}) по коду ${code} (${t.info.entries.length}${t.info.type === 'sng' ? `/${t.info.tableSize}` : ''}) prizePool=${t.info.prizePool}`);

      if (t.info.type === 'sng' && !t.info.scheduledStartAt && t.info.entries.length >= t.info.tableSize) {
        this.start(id);
      }
      return t.info;
    }

    if (t.info.type === 'mtt' && t.info.status === 'running' && t.info.startedAt) {
      const elapsed = Date.now() - t.info.startedAt;
      if (t.info.lateRegMinutes <= 0 || elapsed > t.info.lateRegMinutes * 60_000) {
        return { error: 'late-reg-closed' };
      }

      const bounty = this.bountyPerEntry(t.info);
      const rake = this.rakePerEntry(t.info);
      const tableId = this.seatOrOpenTable(t);
      this.gameManager.seatTournamentPlayer(tableId, userId, username, t.info.startingStack);
      t.info.entries.push({ userId, username, status: 'playing', tableId, promoCode: code, ...(bounty > 0 ? { bounty } : {}) });
      this.creditEntryFee(t.info, t.info.buyIn, bounty, rake);
      promo.redeemedBy.push(userId);
      this.persistPromoCodes();
      this.persist();
      console.log(`🎟️ [promo-redeem] ${username} → "${t.info.name}" (${t.info.id}) по коду ${code} (поздняя рег.) стол=${tableId} prizePool=${t.info.prizePool}`);
      this.gameManager.startGame(tableId);
      this.rebalanceTables(id);
      return t.info;
    }

    return { error: 'registration-closed' };
  }

  unregister(id: string, userId: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    const idx = t.info.entries.findIndex(e => e.userId === userId);
    if (idx < 0) return { error: 'not-registered' };
    const bounty = t.info.entries[idx].bounty ?? 0;
    const rake = this.rakePerEntry(t.info);
    const username = t.info.entries[idx].username;
    const promoCode = t.info.entries[idx].promoCode;
    t.info.entries.splice(idx, 1);
    t.info.prizePool -= t.info.buyIn - bounty - rake;
    // Вход по промокоду не списывал банкролл (рум платил бай-ин сам, см. redeemPromoCode) — refund()
    // тут дал бы игроку чипы, которые он не платил. Вместо этого освобождаем его слот погашения
    // у самого кода, чтобы лимит активаций не сгорал впустую.
    if (promoCode) {
      const promo = this.promoCodes.get(promoCode);
      if (promo) {
        promo.redeemedBy = promo.redeemedBy.filter(u => u !== userId);
        this.persistPromoCodes();
      }
    } else {
      this.refund(userId, t.info.buyIn);
    }
    this.persist();
    console.log(`🏅 [tournament-unregister] ${username} ← "${t.info.name}" (${t.info.id}) (осталось ${t.info.entries.length})`);
    return t.info;
  }

  // SNG: один стол, все зарегистрированные садятся сразу.
  private start(id: string, testDeck?: Card[]): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering') return;
    this.clearStartTimer(t);

    const firstLevel = t.schedule[0];
    const roomId = this.gameManager.createTournamentTable({
      tournamentId: id,
      name: t.info.name,
      maxPlayers: t.info.tableSize,
      smallBlind: firstLevel.smallBlind,
      bigBlind: firstLevel.bigBlind,
      ante: firstLevel.ante,
      format: t.info.format,
    });

    t.info.entries.forEach(e => {
      this.gameManager.seatTournamentPlayer(roomId, e.userId, e.username, t.info.startingStack);
      e.status = 'playing';
      e.tableId = roomId;
    });

    t.info.status = 'running';
    t.info.tableIds = [roomId];
    t.info.startedAt = Date.now();
    this.accrueEntriesTournamentRake(t.info);
    this.persist();
    console.log(`🏅 [tournament-start] SNG "${t.info.name}" (${t.info.id}) стартовал: ${t.info.entries.length} игроков, стол=${roomId}, старт-стек=${t.info.startingStack}, SB/BB=${firstLevel.smallBlind}/${firstLevel.bigBlind}`);

    const hud = this.nextLevelHud(t);
    this.gameManager.setTableBlinds(roomId, firstLevel.smallBlind, firstLevel.bigBlind, firstLevel.ante, hud.nextLevelAt, hud.nextBigBlind);
    t.appliedLevel = firstLevel.level;
    this.gameManager.startGame(roomId, testDeck);
    this.scheduleBlindTimer(id);
  }

  // MTT: несколько столов, случайная рассадка зарегистрированных (как в реальных MTT).
  private startMtt(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering') return;
    this.clearStartTimer(t);

    const firstLevel = t.schedule[0];
    const numTables = Math.max(1, Math.ceil(t.info.entries.length / t.info.tableSize));

    const shuffled = [...t.info.entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const tableIds: string[] = [];
    for (let i = 0; i < numTables; i++) {
      tableIds.push(this.gameManager.createTournamentTable({
        tournamentId: id,
        name: `${t.info.name} — стол ${i + 1}`,
        maxPlayers: t.info.tableSize,
        smallBlind: firstLevel.smallBlind,
        bigBlind: firstLevel.bigBlind,
        ante: firstLevel.ante,
        format: t.info.format,
      }));
    }

    shuffled.forEach((entry, i) => {
      const tableId = tableIds[i % numTables];
      this.gameManager.seatTournamentPlayer(tableId, entry.userId, entry.username, t.info.startingStack);
      entry.status = 'playing';
      entry.tableId = tableId;
    });

    t.info.status = 'running';
    t.info.tableIds = tableIds;
    t.info.startedAt = Date.now();
    this.accrueEntriesTournamentRake(t.info);
    this.persist();
    console.log(`🏅 [tournament-start] MTT "${t.info.name}" (${t.info.id}) стартовал: ${t.info.entries.length} игроков, ${numTables} стол(ов), старт-стек=${t.info.startingStack}, SB/BB=${firstLevel.smallBlind}/${firstLevel.bigBlind}`);

    const hud = this.nextLevelHud(t);
    tableIds.forEach(roomId => {
      this.gameManager.setTableBlinds(roomId, firstLevel.smallBlind, firstLevel.bigBlind, firstLevel.ante, hud.nextLevelAt, hud.nextBigBlind);
      this.gameManager.startGame(roomId);
    });
    t.appliedLevel = firstLevel.level;
    this.scheduleBlindTimer(id);
    if (t.info.fillWithBots) this.scheduleLateFillerBots(id);
  }

  private clearStartTimer(t: TournamentRuntime): void {
    if (t.startTimer) {
      clearTimeout(t.startTimer);
      t.startTimer = null;
    }
  }

  // Авто-старт по scheduledStartAt (ROADMAP §10.19) — таймер до назначенного времени. Вызывается
  // из create() и restoreTournaments(); ms клампится к 0, так что уже прошедшее время (сервер был
  // выключен) срабатывает почти сразу, а не откладывается на потом.
  private scheduleStartTimer(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering' || !t.info.scheduledStartAt) return;
    this.clearStartTimer(t);
    const ms = Math.max(0, t.info.scheduledStartAt - Date.now());
    t.startTimer = setTimeout(() => this.triggerScheduledStart(id), ms);
  }

  // ≥minPlayers (MTT-only настройка, по умолчанию 2) зарегистрированных на момент назначенного старта —
  // стартуем (как forceStart), иначе турнир авто-отменяется с возвратом бай-инов (решение пользователя
  // 2026-07-07 — не зависать в ожидании недобора и не оставлять реальные деньги замороженными без
  // явного действия админа).
  private triggerScheduledStart(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering') return;
    t.startTimer = null;
    const minPlayers = t.info.type === 'mtt' ? (t.info.minPlayers ?? 2) : 2;
    if (t.info.entries.length >= minPlayers) {
      console.log(`🏅 [tournament-scheduled-start] "${t.info.name}" (${t.info.id}) — наступило назначенное время старта, ${t.info.entries.length} игроков`);
      if (t.info.type === 'mtt') this.startMtt(id); else this.start(id);
    } else {
      console.log(`🏅 [tournament-scheduled-start] "${t.info.name}" (${t.info.id}) — наступило время старта, но игроков < ${minPlayers} (${t.info.entries.length}) — авто-отмена`);
      this.cancel(id);
    }
  }

  // Что показать в HUD под общими картами на столе: когда и на сколько вырастут блайнды ДАЛЬШЕ.
  // Оба поля undefined — лестница уже кончилась (см. tournamentSchedule.ts) или турнир не стартовал.
  private nextLevelHud(t: TournamentRuntime): { nextLevelAt?: number; nextBigBlind?: number } {
    if (!t.info.startedAt) return {};
    const elapsed = Date.now() - t.info.startedAt;
    const msLeft = msUntilNextLevel(t.schedule, elapsed);
    if (msLeft === Infinity) return {};
    return { nextLevelAt: Date.now() + msLeft, nextBigBlind: nextLevelBigBlind(t.schedule, elapsed) };
  }

  private scheduleBlindTimer(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'running' || !t.info.startedAt || t.info.tableIds.length === 0) return;
    if (t.blindTimer) {
      clearTimeout(t.blindTimer);
      t.blindTimer = null;
    }

    const elapsed = Date.now() - t.info.startedAt;
    const ms = msUntilNextLevel(t.schedule, elapsed);
    if (ms === Infinity) return; // последний уровень лестницы — больше не растёт

    t.blindTimer = setTimeout(() => {
      const cur = this.tournaments.get(id);
      if (!cur || cur.info.status !== 'running' || cur.info.tableIds.length === 0 || !cur.info.startedAt) return;
      const lvl = currentLevelForElapsed(cur.schedule, Date.now() - cur.info.startedAt);
      // setTimeout умеет проснуться на ~1мс РАНЬШЕ границы уровня — тогда currentLevelForElapsed
      // (строгое `<`) отдаёт всё ещё старый уровень. Без этой проверки он рассылался и логировался
      // повторно, а через миллисекунду приходил настоящий: каждое повышение двоилось в логе.
      if (cur.appliedLevel !== lvl.level) {
        cur.appliedLevel = lvl.level;
        const hud = this.nextLevelHud(cur);
        cur.info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante, hud.nextLevelAt, hud.nextBigBlind));
        console.log(`🏅 [tournament-blinds] "${cur.info.name}" (${cur.info.id}) (${cur.info.id}) уровень ↑ SB/BB=${lvl.smallBlind}/${lvl.bigBlind}${lvl.ante ? ` ante=${lvl.ante}` : ''} (${cur.info.tableIds.length} стол(ов))`);
      }
      this.scheduleBlindTimer(id);
    }, ms);
  }

  // Колбэк из GameManager.autoLeaveBrokePlayers/removePlayer — игрок выбыл (банкрот или форфейт) с турнирного стола.
  // killerIds — победители раздачи, в которой произошёл бaст (пусто при форфейте) — для баунти.
  private handleBust(roomId: string, userId: string, killerIds: string[]): void {
    const t = Array.from(this.tournaments.values()).find(x => x.info.tableIds.includes(roomId));
    if (!t) return;
    // С ре-энтри у юзера может быть несколько entries (старые eliminated) — берём ИМЕННО
    // текущую играющую запись, иначе финализируем не ту (см. ROADMAP §10.6 «Ре-энтри»).
    const entry = t.info.entries.find(e => e.userId === userId && e.status === 'playing');
    if (!entry) return;

    // Считаем ДО того, как пометим текущего банкрота. Это ПРЕДВАРИТЕЛЬНАЯ оценка места (как и prize
    // ниже): при открытых ре-энтри счётчик играющих не убывает строго, поэтому окончательные места
    // раздаются один раз в finish() через computeFinalPlaces — по порядку вылета, без повторов.
    const stillPlaying = t.info.entries.filter(e => e.status === 'playing');
    entry.status = 'eliminated';
    entry.finishPlace = stillPlaying.length;
    entry.eliminationOrder = nextEliminationOrder(t.info.entries); // порядок вылета — основа мест
    entry.tableId = undefined;
    const killerNames = killerIds.map(kid => t.info.entries.find(e => e.userId === kid)?.username ?? kid);
    console.log(`🏅 [tournament-bust] ${entry.username} выбыл из "${t.info.name}" (${t.info.id}) (${t.info.id}) — место ${entry.finishPlace}${killerNames.length ? ` (убийца: ${killerNames.join(', ')})` : ' (форфейт)'}`);

    this.applyBounty(t, entry, killerIds);

    const remaining = stillPlaying.filter(e => e.userId !== userId);

    // Уведомить выбывшего — иначе стол у него молча пропадает (см. GameManager.notifyTournamentResult).
    // prize — лучшая оценка на ТЕКУЩИЙ момент (guarantee-оверлей и поздняя регистрация могут ещё
    // сдвинуть точную сумму — окончательно она начисляется в finish()). reEntryFee — задан, только
    // если можно зайти заново ПРЯМО СЕЙЧАС (как в топ-румах — предлагаем сразу в уведомлении о
    // вылете, не заставляем искать кнопку в лобби турниров, см. ROADMAP §10.19).
    const payoutPreview = this.previewPayout(t.info);
    this.gameManager.notifyTournamentResult(userId, {
      tournamentId: t.info.id,
      tournamentName: t.info.name,
      place: entry.finishPlace,
      totalEntries: t.info.entries.length,
      prize: payoutPreview[entry.finishPlace],
      isWinner: false,
      reEntryFee: this.reEntryFeeIfAvailable(t.info, userId, remaining.length > 1),
    });

    this.persist();

    if (remaining.length <= 1) {
      this.finish(t.info.id, remaining[0]);
      return;
    }
    if (t.info.tableIds.length > 1) {
      this.rebalanceTables(t.info.id);
    }
  }

  // Доступен ли ре-энтри ИМЕННО СЕЙЧАС для этого игрока — та же логика правил, что в register()
  // (read-only, ничего не мутирует). willContinue=false — турнир заканчивается этим же бaстом
  // (remaining<=1, финиш вызовется следом), ре-энтри уже бессмысленен.
  private reEntryFeeIfAvailable(info: TournamentInfo, userId: string, willContinue: boolean): number | undefined {
    if (!willContinue || info.type !== 'mtt' || !info.reEntryEnabled || !info.startedAt) return undefined;
    const elapsed = Date.now() - info.startedAt;
    if (info.lateRegMinutes <= 0 || elapsed > info.lateRegMinutes * 60_000) return undefined;
    const priorEntries = info.entries.filter(e => e.userId === userId);
    if (!info.unlimitedReEntries && priorEntries.length > (info.maxReEntries ?? 0)) return undefined;
    return info.reEntryFee ?? info.buyIn;
  }

  // Живой рэнкинг + сводка для турнирного HUD за столом (TableInfoModal, ROADMAP §10.19). Только
  // пока турнир running — до старта и после финиша живых стеков нет. place — ТЕКУЩАЯ позиция по
  // фишкам прямо сейчас (не путать с entry.finishPlace — окончательное место при выбывании/финише).
  // Структура турнира для карточки в лобби (§10.19): предпросмотр выплат при ЛЮБОМ статусе —
  // игрок должен видеть, как делится банк, ДО регистрации, а не только когда турнир уже идёт.
  getStructure(id: string): TournamentStructure | null {
    const t = this.tournaments.get(id);
    if (!t) return null;
    const payout = this.previewPayout(t.info);
    return {
      prizePool: t.info.prizePool,
      guaranteedPrizePool: t.info.guaranteedPrizePool,
      paidPlaces: Object.keys(payout).length,
      payout,
    };
  }

  getStandings(id: string): TournamentStandings | null {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'running') return null;

    const playing = t.info.entries.filter(e => e.status === 'playing');
    const rows = playing.map(e => {
      const state = e.tableId ? this.gameManager.getGameState(e.tableId) : null;
      const chips = state?.players.find(p => p.id === e.userId)?.chips ?? 0;
      return { userId: e.userId, username: e.username, chips };
    });
    rows.sort((a, b) => b.chips - a.chips);
    const entries = rows.map((r, i) => ({ ...r, place: i + 1 }));

    const payout = this.previewPayout(t.info);
    const lateRegClosesAt =
      t.info.type === 'mtt' && t.info.lateRegMinutes > 0 && t.info.startedAt
        ? t.info.startedAt + t.info.lateRegMinutes * 60_000
        : null;

    return {
      entries,
      totalEntries: t.info.entries.length,
      playersRemaining: playing.length,
      prizePool: t.info.prizePool,
      paidPlaces: Object.keys(payout).length,
      payout,
      lateRegClosesAt,
    };
  }

  // Оценка призовой таблицы на текущий момент (см. handleBust/finish) — тот же расчёт, что и
  // финальный, но без guarantee-оверлея (он применяется только в finish(), когда прошёл весь турнир).
  private previewPayout(info: TournamentInfo): Record<number, number> {
    return info.type === 'mtt'
      ? computeMttPayout(
          info.prizePool,
          info.entries.length,
          info.itmPercent,
          info.payoutMode === 'fixed' ? info.fixedPayoutPlaces : undefined,
          info.payoutCurveExponent ?? 1,
        )
      : computeSngPayout(info.prizePool, info.tableSize);
  }

  // MTT: балансировка (перенос 1 игрока при дисбалансе ≥2) и консолидация (закрытие самого пустого
  // стола, когда столов больше идеального). Не трогает столы мид-хэнд (isTableSafeToRebalance) —
  // если нужный стол сейчас играет раздачу, просто пропускаем тик, следующий бaст повторит проверку.
  private rebalanceTables(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.tableIds.length < 2) return;

    const aliveEntries = t.info.entries.filter(e => e.status === 'playing');
    const seatCounts: TableSeats[] = t.info.tableIds.map(tableId => ({
      tableId,
      count: aliveEntries.filter(e => e.tableId === tableId).length,
    }));

    const toClose = pickTableToClose(seatCounts, aliveEntries.length, t.info.tableSize);
    if (toClose && this.gameManager.isTableSafeToRebalance(toClose)) {
      console.log(`🏅 [tournament-rebalance] "${t.info.name}" (${t.info.id}): консолидация — закрываю стол ${toClose} (${t.info.tableIds.length}→${t.info.tableIds.length - 1} столов)`);
      this.closeAndRedistribute(t, toClose);
      return;
    }

    const move = planRebalanceMove(seatCounts);
    if (move && this.gameManager.isTableSafeToRebalance(move.from)) {
      const entry = aliveEntries.find(e => e.tableId === move.from);
      if (entry && this.gameManager.movePlayerToTable(move.from, move.to, entry.userId)) {
        entry.tableId = move.to;
        this.persist();
        console.log(`🏅 [tournament-rebalance] "${t.info.name}" (${t.info.id}): перенос ${entry.username} ${move.from}→${move.to}`);
      }
    }
  }

  // Перераспределить живых игроков закрываемого стола по оставшимся столам (греди: каждый раз —
  // в наименее заполненный) и закрыть стол. Capacity гарантируется pickTableToClose: столов больше
  // идеального ⇒ у оставшихся в сумме хватает мест на всех живых.
  private closeAndRedistribute(t: TournamentRuntime, tableIdToClose: string): void {
    const entriesAtTable = t.info.entries.filter(e => e.status === 'playing' && e.tableId === tableIdToClose);
    const otherTableIds = t.info.tableIds.filter(id => id !== tableIdToClose);
    const counts = new Map<string, number>(otherTableIds.map(id => [
      id, t.info.entries.filter(e => e.status === 'playing' && e.tableId === id).length,
    ]));

    entriesAtTable.forEach(entry => {
      let destination: string | null = null;
      let minCount = Infinity;
      counts.forEach((count, tableId) => {
        if (count < t.info.tableSize && count < minCount) { minCount = count; destination = tableId; }
      });
      if (!destination) return; // не должно случиться при корректном pickTableToClose
      // Стол закрывается — ждать окна на целевом столе негде, сажаем folded в текущую раздачу.
      if (this.gameManager.movePlayerToTable(tableIdToClose, destination, entry.userId, true)) {
        entry.tableId = destination;
        counts.set(destination, (counts.get(destination) ?? 0) + 1);
      }
    });

    this.gameManager.closeTournamentTable(tableIdToClose);
    t.info.tableIds = t.info.tableIds.filter(id => id !== tableIdToClose);
    this.persist();
    console.log(`🏅 [tournament-rebalance] стол ${tableIdToClose} закрыт, ${entriesAtTable.length} игроков рассажены по ${otherTableIds.length} столам`);
  }

  // Один вход (бай-ин или ре-энтри) деньгами: в призовой — остаток после баунти и рейка, а сами
  // суммы копим отдельно — иначе собранный рейк/баунти нигде не хранятся и журнал экономики
  // (tournamentLedger) не смог бы показать, сколько турнир принёс и сколько стоил.
  private creditEntryFee(info: TournamentInfo, fee: number, bounty: number, rake: number): void {
    info.prizePool += fee - bounty - rake;
    info.collectedFees = (info.collectedFees ?? 0) + fee;
    if (rake > 0) info.collectedRake = (info.collectedRake ?? 0) + rake;
    if (bounty > 0) info.collectedBounty = (info.collectedBounty ?? 0) + bounty;
  }

  // Баунти/PKO: какая часть бай-ина уходит в «цену за голову» этого входа (0, если баунти выключено).
  private bountyPerEntry(info: TournamentInfo): number {
    if (!info.bountyEnabled || !info.bountyPercent) return 0;
    return Math.floor((info.buyIn * info.bountyPercent) / 100);
  }

  // Рейк: доля бай-ина мимо призового фонда (SNG+MTT) — рум забирает как комиссию.
  private rakePerEntry(info: TournamentInfo): number {
    if (!info.rakePercent) return 0;
    return Math.floor((info.buyIn * info.rakePercent) / 100);
  }

  // Турнирная комиссия в отыгрыш депозитного бонуса (§10.21.9). Зачитывается на СТАРТЕ, а не при
  // регистрации: до старта вход можно отменить (unregister возвращает бай-ин), и зачтённый рейк
  // пришлось бы откатывать. Боты ничего не платят, промо-входы оплачивает рум — оба не в счёт.
  private accrueEntriesTournamentRake(info: TournamentInfo): void {
    const rake = this.rakePerEntry(info);
    if (rake <= 0) return;
    info.entries.forEach(e => {
      if (isBot(e.userId) || e.promoCode) return;
      accrueBonusTournamentRake(e.userId, rake);
    });
  }

  // Баунти/PKO: баунти жертвы делится между всеми killerIds (поровну — split при тае на шоудауне)
  // и зачисляется кэшем ПРЯМО в банкролл (не в турнирный стек — см. ROADMAP §10.19, гарантия реальных
  // денег независимо от того, как убийца потом доиграет турнир). При progressive — остаток добавляется
  // к собственному баунти убийцы (растёт по ходу турнира). Форфейт (killerIds=[]) — баунти сгорает,
  // никто не выигрывал раздачу.
  private applyBounty(t: TournamentRuntime, bustedEntry: TournamentEntry, killerIds: string[]): void {
    if (!t.info.bountyEnabled) return;
    const bounty = bustedEntry.bounty ?? 0;
    if (bounty <= 0) return;
    bustedEntry.bounty = 0;

    const killers = killerIds.filter(id => id !== bustedEntry.userId);
    if (killers.length === 0) return;
    const share = Math.floor(bounty / killers.length);
    if (share <= 0) return;

    killers.forEach(killerId => {
      const killerEntry = t.info.entries.find(e => e.userId === killerId && e.status === 'playing');
      if (!killerEntry) return;
      const { cash, addToOwnBounty } = computeBountySplit(t.info.bountyType ?? 'flat', share);
      if (cash > 0) {
        const bankroll = tournamentBankroll.getUserChips(killerId);
        if (bankroll !== null) tournamentBankroll.persistChips(killerId, bankroll + cash);
        killerEntry.bountyWon = (killerEntry.bountyWon ?? 0) + cash;
      }
      if (addToOwnBounty > 0) {
        killerEntry.bounty = (killerEntry.bounty ?? 0) + addToOwnBounty;
      }
      console.log(`🏅 [tournament-bounty] ${bustedEntry.username} → ${killerEntry.username}: ${cash > 0 ? `+${cash} кэш` : ''}${addToOwnBounty > 0 ? ` +${addToOwnBounty} к собств. баунти` : ''}`);
    });
  }

  private leastFullTable(t: TournamentRuntime): string | null {
    const aliveEntries = t.info.entries.filter(e => e.status === 'playing');
    let best: string | null = null;
    let bestCount = Infinity;
    t.info.tableIds.forEach(tableId => {
      const count = aliveEntries.filter(e => e.tableId === tableId).length;
      if (count < t.info.tableSize && count < bestCount) { bestCount = count; best = tableId; }
    });
    return best;
  }

  // Поздняя рег./боты-заполнители после старта: если во ВСЕХ уже открытых столах нет свободного
  // места (например, никто ещё не вылетел) — открываем НОВЫЙ стол на текущем уровне блайндов вместо
  // отказа. Иначе «поздняя регистрация» на деле закрывается, как только столы заполнятся, что
  // противоречит смыслу самого окна поздней регистрации (найдено live-тестом 2026-08-27).
  private seatOrOpenTable(t: TournamentRuntime): string {
    const existing = this.leastFullTable(t);
    if (existing) return existing;
    const elapsed = t.info.startedAt ? Date.now() - t.info.startedAt : 0;
    const lvl = currentLevelForElapsed(t.schedule, elapsed);
    const tableId = this.gameManager.createTournamentTable({
      tournamentId: t.info.id,
      name: `${t.info.name} — стол ${t.info.tableIds.length + 1}`,
      maxPlayers: t.info.tableSize,
      smallBlind: lvl.smallBlind,
      bigBlind: lvl.bigBlind,
      ante: lvl.ante,
      format: t.info.format,
    });
    t.info.tableIds.push(tableId);
    console.log(`🏅 [tournament-new-table] "${t.info.name}" (${t.info.id}): все столы полны — открыт новый стол ${tableId} (${t.info.tableIds.length} стол(ов) всего)`);
    return tableId;
  }

  private finish(id: string, winner?: TournamentEntry): void {
    const t = this.tournaments.get(id);
    if (!t) return;
    if (winner) {
      winner.status = 'eliminated';
      winner.tableId = undefined;
      winner.eliminationOrder = nextEliminationOrder(t.info.entries); // вышел последним → место 1
    }

    // Окончательные места: одно на ИГРОКА, по порядку вылета, без повторов и дыр. До этого места
    // раздавались в момент баста и при открытых ре-энтри могли совпасть у двух разных игроков —
    // на призовом месте это означало полный приз обоим, сверх собранного prizePool (ROADMAP §9.2).
    const finalPlaces = computeFinalPlaces(t.info.entries);
    t.info.entries.forEach((e, i) => { e.finishPlace = finalPlaces[i]; });

    if (t.info.type === 'mtt') {
      const overlay = computeGuaranteeOverlay(t.info.prizePool, t.info.guaranteedPrizePool);
      if (overlay > 0) {
        t.info.prizePool += overlay;
        t.info.overlayPaid = overlay;
      }
    }

    const payout = this.previewPayout(t.info);
    // Страховка поверх computeFinalPlaces: одно призовое место оплачивается один раз, и один игрок
    // получает не больше одного приза. Уникальность мест уже гарантирована выше — сработавший
    // guard означает баг в расчёте мест, поэтому громко логируем, а не молча пропускаем.
    const paidPlaceNumbers = new Set<number>();
    const paidUsers = new Set<string>();
    t.info.entries.forEach(e => {
      const prize = e.finishPlace ? payout[e.finishPlace] : undefined;
      if (!prize) return;
      if (paidPlaceNumbers.has(e.finishPlace!) || paidUsers.has(e.userId)) {
        console.error(`⚠️ [tournament-payout] "${t.info.name}" (${t.info.id}): повторная выплата места ${e.finishPlace} игроку ${e.username} заблокирована`);
        return;
      }
      paidPlaceNumbers.add(e.finishPlace!);
      paidUsers.add(e.userId);
      e.prize = prize;
      const bankroll = tournamentBankroll.getUserChips(e.userId) ?? 0;
      tournamentBankroll.persistChips(e.userId, bankroll + prize);
    });

    // Победитель ещё физически за столом (в отличие от остальных, выбывших раньше через
    // handleBust) — уведомляем его о победе ДО закрытия стола (см. GameManager.notifyTournamentResult).
    if (winner) {
      this.gameManager.notifyTournamentResult(winner.userId, {
        tournamentId: t.info.id,
        tournamentName: t.info.name,
        place: 1,
        totalEntries: t.info.entries.length,
        prize: winner.prize,
        isWinner: true,
      });
    }

    if (t.blindTimer) {
      clearTimeout(t.blindTimer);
      t.blindTimer = null;
    }
    t.fillerBotTimers.forEach(timer => clearTimeout(timer));
    t.fillerBotTimers = [];
    t.info.tableIds.forEach(roomId => this.gameManager.closeTournamentTable(roomId));
    t.info.tableIds = [];
    t.info.status = 'finished';
    t.info.finishedAt = Date.now();
    this.persist();
    // Журнал экономики — переживает уборку турнира из лобби (overlayPaid вместе с ней исчезает).
    recordTournamentFinish(t.info, t.info.finishedAt);
    // Личные итоги игроков (ROI в профиле, прогресс турнирных достижений) — по той же причине
    // копятся здесь, а не считаются по списку турниров: список чистится через 30 минут.
    recordTournamentTotals(t.info);
    // Недельные миссии: турнир засчитывается на финише, по одному разу на живого участника
    // (ре-энтри тем же игроком вторым турниром не считается, боты не участвуют в наградах).
    addMissionProgress(
      Array.from(new Set(t.info.entries.map(e => e.userId)))
        .filter(userId => !isBot(userId))
        .map(userId => ({ userId, tournaments: 1 })),
    );
    const paidPlaces = Object.entries(payout).map(([place, amt]) => `#${place}=${amt}`).join(', ') || '—';
    console.log(`🏅 [tournament-finish] "${t.info.name}" (${t.info.id}) (${t.info.type}) завершён: prizePool=${t.info.prizePool}${t.info.overlayPaid ? ` (оверлей +${t.info.overlayPaid})` : ''}, выплаты: ${paidPlaces}`);
    this.scheduleAutoRemove(id);
  }

  private refund(userId: string, amount: number): void {
    const bankroll = tournamentBankroll.getUserChips(userId);
    if (bankroll !== null) tournamentBankroll.persistChips(userId, bankroll + amount);
  }

  private persist(): void {
    writeTournaments(Array.from(this.tournaments.values()).map(t => t.info));
  }

  private persistPromoCodes(): void {
    writePromoCodes(Array.from(this.promoCodes.values()));
  }

  private generatePromoCodeString(): string {
    let code: string;
    do {
      code = 'PROMO-' + nanoid(8).toUpperCase();
    } while (this.promoCodes.has(code));
    return code;
  }

  // Восстановление после рестарта сервера: перечитать tournaments.json, для 'running' — пересчитать
  // текущий уровень блайндов по прошедшему времени и возобновить таймер уровней на всех столах турнира.
  // Столы (Room) к этому моменту уже восстановлены GameManager'ом из rooms.json (если процесс не падал
  // между записями).
  // Стеки турнирных игроков живут в памяти GameManager (room.players), а rooms.json хранит только
  // конфиг стола — поэтому после рестарта столы поднимаются ПУСТЫМИ. Снимок раздачи
  // (active-hands.json) спасает лишь когда рестарт застал стол с игроками и запись удалась.
  // Держим стеки ещё и в entries: этого достаточно, чтобы пересадить всех заново (см. reseatTables).
  private syncStacks(roomId: string, stacks: Record<string, number>): void {
    const t = Array.from(this.tournaments.values()).find(x => x.info.tableIds.includes(roomId));
    if (!t) return;
    let changed = false;
    t.info.entries.forEach(e => {
      if (e.status !== 'playing' || e.tableId !== roomId) return;
      const chips = stacks[e.userId];
      if (chips === undefined || e.chips === chips) return;
      e.chips = chips;
      changed = true;
    });
    if (changed) this.persist();
  }

  // После рестарта: сажаем обратно тех, кого нет за своим столом. Без этого running-турнир с
  // пустыми столами висит вечно — блайнды растут, никто не выбывает, finish() не наступает
  // (живой прогон 2026-09-02). Вызывается ПОСЛЕ gameManager.restoreActiveHands() — те столы,
  // что восстановились снимком раздачи, уже не пусты и повторно не трогаются.
  private reseatTables(t: TournamentRuntime): number {
    let seated = 0;
    t.info.tableIds.forEach(tableId => {
      const present = this.gameManager.getSeatedPlayerIds(tableId);
      if (present === null) return; // стол не восстановился из rooms.json — нечего наполнять
      const missing = t.info.entries.filter(
        e => e.status === 'playing' && e.tableId === tableId && !present.includes(e.userId),
      );
      missing.forEach(e => {
        // chips появились 2026-09-02; у турниров, запущенных до этого, снимка стека нет —
        // сажаем со стартовым, иначе игрок не вернётся в игру вовсе.
        const chips = e.chips ?? t.info.startingStack;
        if (this.gameManager.seatTournamentPlayer(tableId, e.userId, e.username, chips)) {
          e.chips = chips;
          seated++;
        }
      });
    });
    return seated;
  }

  restoreTournaments(): void {
    const saved = readTournaments();
    let runningCount = 0;
    saved.forEach(info => {
      // Турниры, сохранённые ДО появления startingBigBlind (2026-07-03) — тем же фолбэком, что в create().
      const startingBigBlind = info.startingBigBlind ?? Math.max(10, Math.round(info.startingStack / 75));
      const schedule = buildBlindSchedule(startingBigBlind, info.levelUpMinutes);
      const t: TournamentRuntime = { info, schedule, blindTimer: null, startTimer: null, fillerBotTimers: [], autoRemoveTimer: null, appliedLevel: null };
      this.tournaments.set(info.id, t);
      if (info.status === 'running' && info.tableIds.length > 0 && info.startedAt) {
        runningCount++;
        const lvl = currentLevelForElapsed(schedule, Date.now() - info.startedAt);
        const hud = this.nextLevelHud(t);
        info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante, hud.nextLevelAt, hud.nextBigBlind));
        t.appliedLevel = lvl.level;
        this.scheduleBlindTimer(info.id);
        const reseated = this.reseatTables(t);
        console.log(`🏅 [tournament-restore] "${info.name}" (${info.id}, running) — уровень SB/BB=${lvl.smallBlind}/${lvl.bigBlind} восстановлен на ${info.tableIds.length} стол(ов)${reseated > 0 ? `, пересажено игроков: ${reseated}` : ''}`);
        if (reseated > 0) {
          this.persist();
          // startGame молча выходит при <2 игроках — безопасно звать на каждый стол.
          info.tableIds.forEach(tableId => this.gameManager.startGame(tableId));
        }
      }
      if (info.status === 'registering' && info.scheduledStartAt) {
        this.scheduleStartTimer(info.id);
        console.log(`🏅 [tournament-restore] "${info.name}" (${info.id}, registering) — таймер авто-старта восстановлен (${new Date(info.scheduledStartAt).toISOString()})`);
      }
      // Автоудаление завершённого из списка — обычный setTimeout, он не переживает рестарт: турнир,
      // доигранный до перезапуска, раньше оставался в лобби НАВСЕГДА (тестовые так провисели ~10
      // дней, ROADMAP §10.19). Планируем заново с учётом уже прошедшего времени; если 30 минут
      // истекли или отметки времени нет вовсе — уйдёт на ближайшем тике.
      if (info.status === 'finished' || info.status === 'cancelled') {
        const elapsed = info.finishedAt ? Date.now() - info.finishedAt : Infinity;
        this.scheduleAutoRemove(info.id, TournamentManager.AUTO_REMOVE_DELAY_MS - elapsed);
      }
      // Незаметное заполнение ботами (roadmap 2026-07-09) — исходные setTimeout'ы не переживают
      // рестарт, довосстанавливаем недостающих ботов с свежими случайными задержками (не пытаемся
      // точно воспроизвести исходное расписание — best-effort, как и остальной bot-fill механизм).
      if (info.fillWithBots && info.botFillTarget) {
        const fillerCount = info.entries.filter(e => e.userId.startsWith(FILLER_BOT_ID_PREFIX)).length;
        const remaining = info.botFillTarget - fillerCount;
        if (info.status === 'registering' && remaining > 0) {
          this.scheduleFillerBotAttempts(info.id, remaining, 10_000, 5 * 60_000);
          console.log(`🏅 [tournament-restore] "${info.name}" (${info.id}): ${remaining} бот(а)-заполнителя довосстановлено на регистрацию`);
        } else if (info.status === 'running' && info.type === 'mtt' && info.lateRegMinutes > 0 && info.startedAt && remaining > 0) {
          const closesInMs = info.startedAt + info.lateRegMinutes * 60_000 - Date.now();
          if (closesInMs > 5_000) {
            this.scheduleFillerBotAttempts(info.id, remaining, 0, closesInMs * 0.85);
            console.log(`🏅 [tournament-restore] "${info.name}" (${info.id}): ${remaining} бот(а)-заполнителя довосстановлено на позднюю рег.`);
          }
        }
      }
    });
    if (saved.length > 0) {
      console.log(`🏅 [tournament-restore] восстановлено ${saved.length} турнир(ов) из tournaments.json, ${runningCount} в статусе running`);
    }
  }
}

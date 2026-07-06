import { nanoid } from 'nanoid';
import type {
  TournamentInfo, TournamentEntry, CreateTournamentOptions, BlindLevel, MttItmPercent, MttPayoutMode, BountyType,
} from '@poker-room/shared';
import type { GameManager } from '../GameManager.js';
import type { Card } from '../types.js';
import { buildBlindSchedule, currentLevelForElapsed, msUntilNextLevel, nextLevelBigBlind } from './tournamentSchedule.js';
import { computeSngPayout, computeMttPayout, computeGuaranteeOverlay, computeBountySplit } from './tournamentPayout.js';
import { planRebalanceMove, pickTableToClose, type TableSeats } from './tournamentBalancing.js';
import { readTournaments, writeTournaments } from './tournamentStorage.js';
import { tournamentBankroll } from './tournamentBankroll.js';

type ServiceError = { error: string };

interface TournamentRuntime {
  info: TournamentInfo;
  schedule: BlindLevel[];
  blindTimer: NodeJS.Timeout | null;
}

const VALID_ITM: MttItmPercent[] = [10, 12, 15, 20];

// Оркестрация турниров (ROADMAP §10 «Турниры», SNG+MTT v1). Не трогает игровое ядро — создаёт/сажает/
// закрывает столы через публичные методы GameManager (createTournamentTable/seatTournamentPlayer/
// setTableBlinds/closeTournamentTable/movePlayerToTable) и подписывается на onTournamentBust для элиминации.
// Турнирные фишки — НЕ банкролл: бай-ин дебетуется один раз при регистрации (tournamentBankroll),
// призовые кредитуются один раз при завершении.
// SNG = MTT с одним столом (tableIds.length===1) — общие пути (блайнд-таймер/бaст/финиш) переиспользуются,
// балансировка/консолидация между столами включаются только когда tableIds.length>1.
export class TournamentManager {
  private tournaments = new Map<string, TournamentRuntime>();

  constructor(private gameManager: GameManager) {
    gameManager.onTournamentBust = (roomId, userId, killerIds) => this.handleBust(roomId, userId, killerIds);
  }

  list(): TournamentInfo[] {
    return Array.from(this.tournaments.values()).map(t => t.info);
  }

  get(id: string): TournamentInfo | null {
    return this.tournaments.get(id)?.info ?? null;
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
    if (!Number.isInteger(opts.levelUpMinutes) || opts.levelUpMinutes < 1 || opts.levelUpMinutes > 60) {
      return { error: 'invalid-level-minutes' };
    }
    const lateRegMinutes = opts.type === 'mtt' ? (opts.lateRegMinutes ?? 0) : 0;
    if (!Number.isInteger(lateRegMinutes) || lateRegMinutes < 0 || lateRegMinutes > 120) {
      return { error: 'invalid-late-reg' };
    }
    const itmPercent = opts.type === 'mtt' ? (opts.itmPercent ?? 15) : 100 as MttItmPercent;
    if (opts.type === 'mtt' && !VALID_ITM.includes(itmPercent)) return { error: 'invalid-itm-percent' };

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

    const reEntryEnabled = opts.type === 'mtt' ? !!opts.reEntryEnabled : false;
    let maxReEntries: number | undefined;
    let reEntryFee: number | undefined;
    if (reEntryEnabled) {
      const mr = opts.maxReEntries ?? 1;
      if (!Number.isInteger(mr) || mr < 1 || mr > 10) return { error: 'invalid-max-reentries' };
      maxReEntries = mr;
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
      itmPercent,
      payoutMode,
      fixedPayoutPlaces,
      reEntryEnabled,
      maxReEntries,
      reEntryFee,
      guaranteedPrizePool,
      bountyEnabled,
      bountyType,
      bountyPercent,
      createdBy,
      createdAt: Date.now(),
    };
    this.tournaments.set(id, { info, schedule: buildBlindSchedule(startingBigBlind, opts.levelUpMinutes), blindTimer: null });
    this.persist();
    console.log(`🏅 [tournament-create] "${info.name}" (${info.type}, id=${id}) buyIn=${info.buyIn} startStack=${info.startingStack} startBB=${startingBigBlind} tableSize=${info.tableSize} speed=${info.blindSpeed} levelUp=${info.levelUpMinutes}м${bountyEnabled ? ` bounty=${bountyType}/${bountyPercent}%` : ''}${guaranteedPrizePool ? ` guarantee=${guaranteedPrizePool}` : ''}${reEntryEnabled ? ` reEntry(max=${maxReEntries}, fee=${reEntryFee})` : ''}`);
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
    t.info.entries.forEach(e => this.refund(e.userId, t.info.buyIn));
    if (t.blindTimer) {
      clearTimeout(t.blindTimer);
      t.blindTimer = null;
    }
    t.info.tableIds.forEach(roomId => this.gameManager.closeTournamentTable(roomId));
    t.info.tableIds = [];
    console.log(`🏅 [tournament-cancel] "${t.info.name}" (id=${id}${wasRunning ? ', был running — столы закрыты принудительно' : ''}) — возврат бай-инов ${t.info.entries.length} игрокам`);
    t.info.status = 'cancelled';
    this.persist();
    return t.info;
  }

  // Удаление из списка ЗАВЕРШЁННОГО/отменённого турнира (архивации пока нет, ROADMAP §9.5 —
  // список иначе засоряется тестовыми турнирами навсегда). registering/running трогать нельзя —
  // там реальные бай-ины и незавершённая игра, для них есть только cancel().
  remove(id: string): { ok: true } | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'finished' && t.info.status !== 'cancelled') return { error: 'invalid-status' };
    this.tournaments.delete(id);
    console.log(`🏅 [tournament-remove] "${t.info.name}" (id=${id}, status=${t.info.status}) — убран из списка`);
    this.persist();
    return { ok: true };
  }

  // Принудительный старт админом до заполнения стола (нужно ≥2 зарегистрированных). Для MTT — единственный
  // способ старта (нет авто-старта по заполнению, в отличие от SNG).
  // testDeck — опциональный параметр для тестов SNG (как GameManager.startGame), production-вызовы его не передают.
  forceStart(id: string, testDeck?: Card[]): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    if (t.info.entries.length < 2) return { error: 'not-enough-players' };
    console.log(`🏅 [tournament-force-start] admin принудительно стартовал "${t.info.name}" (${t.info.entries.length} игроков)`);
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
    console.log(`🏅 [tournament-add-bots] "${t.info.name}" +${bots.length} тестовых ботов (target=minus, без бай-ина, entries=${t.info.entries.length})`);

    if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) {
      this.start(id);
    }
    return t.info;
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
      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": full`);
        return { error: 'full' };
      }

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < t.info.buyIn) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": insufficient-bankroll (нужно ${t.info.buyIn}, есть ${bankroll})`);
        return { error: 'insufficient-bankroll' };
      }

      const bounty = this.bountyPerEntry(t.info);
      tournamentBankroll.persistChips(userId, bankroll - t.info.buyIn);
      t.info.entries.push({ userId, username, status: 'registered', ...(bounty > 0 ? { bounty } : {}) });
      t.info.prizePool += t.info.buyIn - bounty;
      this.persist();
      console.log(`🏅 [tournament-register] ${username} → "${t.info.name}" (${t.info.entries.length}${t.info.type === 'sng' ? `/${t.info.tableSize}` : ''}) prizePool=${t.info.prizePool}`);

      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) {
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
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": late-reg-closed (прошло ${Math.round(elapsed / 60_000)}м из ${t.info.lateRegMinutes}м)`);
        return { error: 'late-reg-closed' };
      }

      const priorEntries = t.info.entries.filter(e => e.userId === userId);
      const isReEntry = priorEntries.length > 0;
      if (isReEntry) {
        if (!t.info.reEntryEnabled) {
          console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": reentry-disabled`);
          return { error: 'reentry-disabled' };
        }
        if (priorEntries.length > (t.info.maxReEntries ?? 0)) {
          console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": reentry-limit-reached (${priorEntries.length}/${t.info.maxReEntries})`);
          return { error: 'reentry-limit-reached' };
        }
      }
      const fee = isReEntry ? (t.info.reEntryFee ?? t.info.buyIn) : t.info.buyIn;

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < fee) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": insufficient-bankroll (нужно ${fee}, есть ${bankroll})`);
        return { error: 'insufficient-bankroll' };
      }

      const tableId = this.leastFullTable(t);
      if (!tableId) {
        console.log(`🏅 [tournament-register-rejected] ${username} → "${t.info.name}": no-seats-available`);
        return { error: 'no-seats-available' };
      }

      const bounty = this.bountyPerEntry(t.info);
      tournamentBankroll.persistChips(userId, bankroll - fee);
      this.gameManager.seatTournamentPlayer(tableId, userId, username, t.info.startingStack);
      t.info.entries.push({ userId, username, status: 'playing', tableId, ...(bounty > 0 ? { bounty } : {}) });
      t.info.prizePool += fee - bounty;
      this.persist();
      console.log(`🏅 [tournament-register] ${username} → "${t.info.name}" ${priorEntries.length > 0 ? '(ре-энтри) ' : '(поздняя рег.) '}стол=${tableId} prizePool=${t.info.prizePool}`);
      // Неровный сплит при старте MTT может оставить стол с 1 игроком (status='waiting',
      // startGame внутри startMtt молча вышел по players.size<2) — позднюю посадку нужно
      // довести до реальной раздачи. No-op, если стол уже playing/полон.
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
    const username = t.info.entries[idx].username;
    t.info.entries.splice(idx, 1);
    t.info.prizePool -= t.info.buyIn - bounty;
    this.refund(userId, t.info.buyIn);
    this.persist();
    console.log(`🏅 [tournament-unregister] ${username} ← "${t.info.name}" (осталось ${t.info.entries.length})`);
    return t.info;
  }

  // SNG: один стол, все зарегистрированные садятся сразу.
  private start(id: string, testDeck?: Card[]): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering') return;

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
    this.persist();
    console.log(`🏅 [tournament-start] SNG "${t.info.name}" стартовал: ${t.info.entries.length} игроков, стол=${roomId}, старт-стек=${t.info.startingStack}, SB/BB=${firstLevel.smallBlind}/${firstLevel.bigBlind}`);

    const hud = this.nextLevelHud(t);
    this.gameManager.setTableBlinds(roomId, firstLevel.smallBlind, firstLevel.bigBlind, firstLevel.ante, hud.nextLevelAt, hud.nextBigBlind);
    this.gameManager.startGame(roomId, testDeck);
    this.scheduleBlindTimer(id);
  }

  // MTT: несколько столов, случайная рассадка зарегистрированных (как в реальных MTT).
  private startMtt(id: string): void {
    const t = this.tournaments.get(id);
    if (!t || t.info.status !== 'registering') return;

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
    this.persist();
    console.log(`🏅 [tournament-start] MTT "${t.info.name}" стартовал: ${t.info.entries.length} игроков, ${numTables} стол(ов), старт-стек=${t.info.startingStack}, SB/BB=${firstLevel.smallBlind}/${firstLevel.bigBlind}`);

    const hud = this.nextLevelHud(t);
    tableIds.forEach(roomId => {
      this.gameManager.setTableBlinds(roomId, firstLevel.smallBlind, firstLevel.bigBlind, firstLevel.ante, hud.nextLevelAt, hud.nextBigBlind);
      this.gameManager.startGame(roomId);
    });
    this.scheduleBlindTimer(id);
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
      const hud = this.nextLevelHud(cur);
      cur.info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante, hud.nextLevelAt, hud.nextBigBlind));
      console.log(`🏅 [tournament-blinds] "${cur.info.name}" уровень ↑ SB/BB=${lvl.smallBlind}/${lvl.bigBlind}${lvl.ante ? ` ante=${lvl.ante}` : ''} (${cur.info.tableIds.length} стол(ов))`);
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

    // Считаем ДО того, как пометим текущего банкрота — finishPlace = число живших на момент баста.
    const stillPlaying = t.info.entries.filter(e => e.status === 'playing');
    entry.status = 'eliminated';
    entry.finishPlace = stillPlaying.length;
    entry.tableId = undefined;
    console.log(`🏅 [tournament-bust] ${entry.username} выбыл из "${t.info.name}" — место ${entry.finishPlace}${killerIds.length ? ` (убийца: ${killerIds.join(', ')})` : ' (форфейт)'}`);

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
    if (priorEntries.length > (info.maxReEntries ?? 0)) return undefined;
    return info.reEntryFee ?? info.buyIn;
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
      console.log(`🏅 [tournament-rebalance] "${t.info.name}": консолидация — закрываю стол ${toClose} (${t.info.tableIds.length}→${t.info.tableIds.length - 1} столов)`);
      this.closeAndRedistribute(t, toClose);
      return;
    }

    const move = planRebalanceMove(seatCounts);
    if (move && this.gameManager.isTableSafeToRebalance(move.from)) {
      const entry = aliveEntries.find(e => e.tableId === move.from);
      if (entry && this.gameManager.movePlayerToTable(move.from, move.to, entry.userId)) {
        entry.tableId = move.to;
        this.persist();
        console.log(`🏅 [tournament-rebalance] "${t.info.name}": перенос ${entry.username} ${move.from}→${move.to}`);
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
      if (this.gameManager.movePlayerToTable(tableIdToClose, destination, entry.userId)) {
        entry.tableId = destination;
        counts.set(destination, (counts.get(destination) ?? 0) + 1);
      }
    });

    this.gameManager.closeTournamentTable(tableIdToClose);
    t.info.tableIds = t.info.tableIds.filter(id => id !== tableIdToClose);
    this.persist();
    console.log(`🏅 [tournament-rebalance] стол ${tableIdToClose} закрыт, ${entriesAtTable.length} игроков рассажены по ${otherTableIds.length} столам`);
  }

  // Баунти/PKO: какая часть бай-ина уходит в «цену за голову» этого входа (0, если баунти выключено).
  private bountyPerEntry(info: TournamentInfo): number {
    if (!info.bountyEnabled || !info.bountyPercent) return 0;
    return Math.floor((info.buyIn * info.bountyPercent) / 100);
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

  private finish(id: string, winner?: TournamentEntry): void {
    const t = this.tournaments.get(id);
    if (!t) return;
    if (winner) {
      winner.status = 'eliminated';
      winner.finishPlace = 1;
      winner.tableId = undefined;
    }

    if (t.info.type === 'mtt') {
      const overlay = computeGuaranteeOverlay(t.info.prizePool, t.info.guaranteedPrizePool);
      if (overlay > 0) {
        t.info.prizePool += overlay;
        t.info.overlayPaid = overlay;
      }
    }

    const payout = this.previewPayout(t.info);
    t.info.entries.forEach(e => {
      const prize = e.finishPlace ? payout[e.finishPlace] : undefined;
      if (prize) {
        e.prize = prize;
        const bankroll = tournamentBankroll.getUserChips(e.userId) ?? 0;
        tournamentBankroll.persistChips(e.userId, bankroll + prize);
      }
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
    t.info.tableIds.forEach(roomId => this.gameManager.closeTournamentTable(roomId));
    t.info.tableIds = [];
    t.info.status = 'finished';
    t.info.finishedAt = Date.now();
    this.persist();
    const paidPlaces = Object.entries(payout).map(([place, amt]) => `#${place}=${amt}`).join(', ') || '—';
    console.log(`🏅 [tournament-finish] "${t.info.name}" (${t.info.type}) завершён: prizePool=${t.info.prizePool}${t.info.overlayPaid ? ` (оверлей +${t.info.overlayPaid})` : ''}, выплаты: ${paidPlaces}`);
  }

  private refund(userId: string, amount: number): void {
    const bankroll = tournamentBankroll.getUserChips(userId);
    if (bankroll !== null) tournamentBankroll.persistChips(userId, bankroll + amount);
  }

  private persist(): void {
    writeTournaments(Array.from(this.tournaments.values()).map(t => t.info));
  }

  // Восстановление после рестарта сервера: перечитать tournaments.json, для 'running' — пересчитать
  // текущий уровень блайндов по прошедшему времени и возобновить таймер уровней на всех столах турнира.
  // Столы (Room) к этому моменту уже восстановлены GameManager'ом из rooms.json (если процесс не падал
  // между записями).
  restoreTournaments(): void {
    const saved = readTournaments();
    let runningCount = 0;
    saved.forEach(info => {
      // Турниры, сохранённые ДО появления startingBigBlind (2026-07-03) — тем же фолбэком, что в create().
      const startingBigBlind = info.startingBigBlind ?? Math.max(10, Math.round(info.startingStack / 75));
      const schedule = buildBlindSchedule(startingBigBlind, info.levelUpMinutes);
      const t = { info, schedule, blindTimer: null };
      this.tournaments.set(info.id, t);
      if (info.status === 'running' && info.tableIds.length > 0 && info.startedAt) {
        runningCount++;
        const lvl = currentLevelForElapsed(schedule, Date.now() - info.startedAt);
        const hud = this.nextLevelHud(t);
        info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante, hud.nextLevelAt, hud.nextBigBlind));
        this.scheduleBlindTimer(info.id);
        console.log(`🏅 [tournament-restore] "${info.name}" (running, id=${info.id}) — уровень SB/BB=${lvl.smallBlind}/${lvl.bigBlind} восстановлен на ${info.tableIds.length} стол(ов)`);
      }
    });
    if (saved.length > 0) {
      console.log(`🏅 [tournament-restore] восстановлено ${saved.length} турнир(ов) из tournaments.json, ${runningCount} в статусе running`);
    }
  }
}

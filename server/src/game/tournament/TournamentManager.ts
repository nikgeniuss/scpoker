import { nanoid } from 'nanoid';
import type {
  TournamentInfo, TournamentEntry, CreateTournamentOptions, BlindLevel, MttItmPercent, MttPayoutMode,
} from '@poker-room/shared';
import type { GameManager } from '../GameManager.js';
import type { Card } from '../types.js';
import { buildBlindSchedule, currentLevelForElapsed, msUntilNextLevel } from './tournamentSchedule.js';
import { computeSngPayout, computeMttPayout } from './tournamentPayout.js';
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
    gameManager.onTournamentBust = (roomId, userId) => this.handleBust(roomId, userId);
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
    if (!Number.isInteger(opts.buyIn) || opts.buyIn <= 0) return { error: 'invalid-buyin' };
    if (!Number.isInteger(opts.startingStack) || opts.startingStack <= 0) return { error: 'invalid-starting-stack' };
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

    const id = nanoid(10);
    const info: TournamentInfo = {
      id,
      name: opts.name.trim().slice(0, 60),
      type: opts.type,
      format: opts.format === 'shortdeck' ? 'shortdeck' : 'nlh',
      status: 'registering',
      buyIn: opts.buyIn,
      startingStack: opts.startingStack,
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
      createdBy,
      createdAt: Date.now(),
    };
    this.tournaments.set(id, { info, schedule: buildBlindSchedule(opts.startingStack, opts.blindSpeed), blindTimer: null });
    this.persist();
    return info;
  }

  cancel(id: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    t.info.entries.forEach(e => this.refund(e.userId, t.info.buyIn));
    t.info.status = 'cancelled';
    this.persist();
    return t.info;
  }

  // Принудительный старт админом до заполнения стола (нужно ≥2 зарегистрированных). Для MTT — единственный
  // способ старта (нет авто-старта по заполнению, в отличие от SNG).
  // testDeck — опциональный параметр для тестов SNG (как GameManager.startGame), production-вызовы его не передают.
  forceStart(id: string, testDeck?: Card[]): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.status !== 'registering') return { error: 'invalid-status' };
    if (t.info.entries.length < 2) return { error: 'not-enough-players' };
    if (t.info.type === 'mtt') {
      this.startMtt(id);
    } else {
      this.start(id, testDeck);
    }
    return t.info;
  }

  register(id: string, userId: string, username: string): TournamentInfo | ServiceError {
    const t = this.tournaments.get(id);
    if (!t) return { error: 'not-found' };
    if (t.info.entries.some(e => e.userId === userId)) return { error: 'already-registered' };

    if (t.info.status === 'registering') {
      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) return { error: 'full' };

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < t.info.buyIn) return { error: 'insufficient-bankroll' };

      tournamentBankroll.persistChips(userId, bankroll - t.info.buyIn);
      t.info.entries.push({ userId, username, status: 'registered' });
      t.info.prizePool += t.info.buyIn;
      this.persist();

      if (t.info.type === 'sng' && t.info.entries.length >= t.info.tableSize) {
        this.start(id);
      }
      return t.info;
    }

    // Поздняя регистрация (только MTT, в окне lateRegMinutes после старта).
    if (t.info.type === 'mtt' && t.info.status === 'running' && t.info.startedAt) {
      const elapsed = Date.now() - t.info.startedAt;
      if (t.info.lateRegMinutes <= 0 || elapsed > t.info.lateRegMinutes * 60_000) return { error: 'late-reg-closed' };

      const bankroll = tournamentBankroll.getUserChips(userId);
      if (bankroll === null) return { error: 'user-not-found' };
      if (bankroll < t.info.buyIn) return { error: 'insufficient-bankroll' };

      const tableId = this.leastFullTable(t);
      if (!tableId) return { error: 'no-seats-available' };

      tournamentBankroll.persistChips(userId, bankroll - t.info.buyIn);
      this.gameManager.seatTournamentPlayer(tableId, userId, username, t.info.startingStack);
      t.info.entries.push({ userId, username, status: 'playing', tableId });
      t.info.prizePool += t.info.buyIn;
      this.persist();
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
    t.info.entries.splice(idx, 1);
    t.info.prizePool -= t.info.buyIn;
    this.refund(userId, t.info.buyIn);
    this.persist();
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

    tableIds.forEach(roomId => this.gameManager.startGame(roomId));
    this.scheduleBlindTimer(id);
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
      cur.info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante));
      this.scheduleBlindTimer(id);
    }, ms);
  }

  // Колбэк из GameManager.autoLeaveBrokePlayers/removePlayer — игрок выбыл (банкрот или форфейт) с турнирного стола.
  private handleBust(roomId: string, userId: string): void {
    const t = Array.from(this.tournaments.values()).find(x => x.info.tableIds.includes(roomId));
    if (!t) return;
    const entry = t.info.entries.find(e => e.userId === userId);
    if (!entry || entry.status !== 'playing') return;

    // Считаем ДО того, как пометим текущего банкрота — finishPlace = число живших на момент баста.
    const stillPlaying = t.info.entries.filter(e => e.status === 'playing');
    entry.status = 'eliminated';
    entry.finishPlace = stillPlaying.length;
    entry.tableId = undefined;

    const remaining = stillPlaying.filter(e => e.userId !== userId);
    this.persist();

    if (remaining.length <= 1) {
      this.finish(t.info.id, remaining[0]);
      return;
    }
    if (t.info.tableIds.length > 1) {
      this.rebalanceTables(t.info.id);
    }
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
      this.closeAndRedistribute(t, toClose);
      return;
    }

    const move = planRebalanceMove(seatCounts);
    if (move && this.gameManager.isTableSafeToRebalance(move.from)) {
      const entry = aliveEntries.find(e => e.tableId === move.from);
      if (entry && this.gameManager.movePlayerToTable(move.from, move.to, entry.userId)) {
        entry.tableId = move.to;
        this.persist();
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

    const payout = t.info.type === 'mtt'
      ? computeMttPayout(
          t.info.prizePool,
          t.info.entries.length,
          t.info.itmPercent,
          t.info.payoutMode === 'fixed' ? t.info.fixedPayoutPlaces : undefined,
        )
      : computeSngPayout(t.info.prizePool, t.info.tableSize);
    t.info.entries.forEach(e => {
      const prize = e.finishPlace ? payout[e.finishPlace] : undefined;
      if (prize) {
        e.prize = prize;
        const bankroll = tournamentBankroll.getUserChips(e.userId) ?? 0;
        tournamentBankroll.persistChips(e.userId, bankroll + prize);
      }
    });

    if (t.blindTimer) {
      clearTimeout(t.blindTimer);
      t.blindTimer = null;
    }
    t.info.tableIds.forEach(roomId => this.gameManager.closeTournamentTable(roomId));
    t.info.tableIds = [];
    t.info.status = 'finished';
    t.info.finishedAt = Date.now();
    this.persist();
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
    saved.forEach(info => {
      const schedule = buildBlindSchedule(info.startingStack, info.blindSpeed);
      this.tournaments.set(info.id, { info, schedule, blindTimer: null });
      if (info.status === 'running' && info.tableIds.length > 0 && info.startedAt) {
        const lvl = currentLevelForElapsed(schedule, Date.now() - info.startedAt);
        info.tableIds.forEach(roomId => this.gameManager.setTableBlinds(roomId, lvl.smallBlind, lvl.bigBlind, lvl.ante));
        this.scheduleBlindTimer(info.id);
      }
    });
  }
}

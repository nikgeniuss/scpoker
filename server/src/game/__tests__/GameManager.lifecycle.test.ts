import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';
import { getStorage } from './helpers/storage.js';

// Тесты §11 (тайминг), §12 (late entry / disconnect) POKER_RULES.md.

const TIMEBANK_SETTINGS = {
  enabled: true,
  startSec: 30,
  bonusSec: 10,
  bonusEveryHands: 10,
  capSec: 60,
  allowPerTableOverride: false,
};

const DEFAULT_BOT_MODE = {
  enabled: false,
  peekMode: 'river' as const,
  tablesPerLevel: 1,
  botsPerTable: 3,
  defaultBuyInBb: 100,
  refillIntervalMs: 120_000,
};

type StateView = {
  phase: string;
  currentPlayerIndex: number;
  dealerIndex: number;
  players: Array<{
    id: string;
    chips: number;
    currentBet: number;
    isFolded: boolean;
    disconnected: boolean;
    timebank?: number;
  }>;
  pot: number;
  currentBet: number;
  turnEndsAt: number | null;
  turnTimebankEndsAt: number | null;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function makeDeck(playerCount: number) {
  const cardsList = [];
  const suits = ['s', 'h', 'd', 'c'] as const;
  const ranks: Array<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'> =
    ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6'];
  for (let i = 0; i < playerCount; i++) {
    cardsList.push(card(ranks[i], suits[0]), card(ranks[i], suits[1]));
  }
  return buildDeck(...cardsList);
}

async function setupTable(playerCount: number, opts?: { timebank?: typeof TIMEBANK_SETTINGS }) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'LifecycleRoom',
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 20,
      buyInMaxBb: 100,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < playerCount; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, io, roomId };
}

describe('GameManager — lifecycle, timers, disconnect, late entry', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Multi-hand: dealer rotation, stacks, hand counter', () => {
    it('dealerIndex двигается +1 между раздачами', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      const d1 = getState(gm, roomId).dealerIndex;
      expect(d1).toBe(1);
      // Завершить раздачу через fold
      gm.handlePlayerAction(roomId, 'B', 'fold');
      // endGame → setTimeout(cleanupHand, 5000). Advance.
      vi.advanceTimersByTime(5001);
      // Cleanup → startGame новой раздачи (со shuffleDeck — мы не контролируем колоду здесь,
      // но нам нужен только dealerIndex). Cleanup вызвал scheduleAutoStart, не startGame напрямую (см. 1424).
      // Но 1424 говорит «if size >= 2 → startGame mgновенно». Так что startGame вызвался.
      const d2 = getState(gm, roomId).dealerIndex;
      expect(d2).toBe(0); // (1+1)%2 = 0
    });

    it('стеки переходят между раздачами', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // B (D=SB) fold preflop → A забирает SB=5+BB=10 = pot=15
      gm.handlePlayerAction(roomId, 'B', 'fold');
      // Перед advance: A.chips должна быть 1000-10+15=1005, B=1000-5=995
      // Note: chips checked before cleanup; cleanup runs after 5s timer
      const beforeCleanup = getState(gm, roomId);
      const aChipsBefore = beforeCleanup.players.find((p) => p.id === 'A')!.chips;
      const bChipsBefore = beforeCleanup.players.find((p) => p.id === 'B')!.chips;
      expect(aChipsBefore).toBe(1005);
      expect(bChipsBefore).toBe(995);
      // После cleanup → startGame новой раздачи. Стеки от прошлой раздачи перешли:
      // A=1005 (выиграл), B=995 (проиграл). Но новые blinds: A=D=SB=-5, B=BB=-10.
      // → A=1000, B=985. Главное — стек перешёл, не сброшен в 1000/1000.
      vi.advanceTimersByTime(5001);
      const after = getState(gm, roomId);
      const aChips = after.players.find((p) => p.id === 'A')!.chips;
      const bChips = after.players.find((p) => p.id === 'B')!.chips;
      // A — D=SB во второй раздаче (dealerIndex=0), paid 5. 1005-5=1000.
      // B — BB во второй раздаче, paid 10. 995-10=985.
      expect(aChips).toBe(1000);
      expect(bChips).toBe(985);
    });

    it('handsAtTable инкрементируется (через timebank bonus)', async () => {
      // Используем bonusEveryHands=1 чтобы каждая рука = +bonusSec.
      const customSettings = {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, startSec: 10, bonusSec: 5, bonusEveryHands: 1, capSec: 30 },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'TBHandsRoom',
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 9,
          turnDurationSec: 30,
          buyInMinBb: 20,
          buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));
      // Завершить раздачу
      gm.handlePlayerAction(roomId, 'B', 'fold');
      vi.advanceTimersByTime(5001);
      // После cleanup: handsAtTable=1, bonus добавлен (10 → 15).
      const s = getState(gm, roomId);
      const a = s.players.find((p) => p.id === 'A')!;
      // У живых игроков timebank пополнился (если они не разорились)
      expect(a.timebank).toBe(15); // 10 + 5 (bonus)
    });
  });

  describe('Timebank bonus and cap', () => {
    it('timebank bonus каждые N рук добавляется', async () => {
      const customSettings = {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, startSec: 10, bonusSec: 20, bonusEveryHands: 2, capSec: 100 },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'TBBonusRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
          turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      // 2 раздачи подряд: после первой handsAtTable=1 (нет бонуса), после второй handsAtTable=2 (+20).
      gm.startGame(roomId, makeDeck(2));
      gm.handlePlayerAction(roomId, 'B', 'fold');
      vi.advanceTimersByTime(5001);
      let s = getState(gm, roomId);
      expect(s.players.find((p) => p.id === 'A')!.timebank).toBe(10); // ещё нет бонуса
      // Вторая раздача
      gm.handlePlayerAction(roomId, getState(gm, roomId).players[getState(gm, roomId).currentPlayerIndex].id, 'fold');
      vi.advanceTimersByTime(5001);
      s = getState(gm, roomId);
      // Один из них прибавил +20 (зависит от того, кто остался после fold)
      const a = s.players.find((p) => p.id === 'A');
      const b = s.players.find((p) => p.id === 'B');
      expect(a?.timebank === 30 || b?.timebank === 30).toBe(true);
    });

    it('timebank ограничен capSec', async () => {
      const customSettings = {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, startSec: 30, bonusSec: 20, bonusEveryHands: 1, capSec: 40 },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'TBCapRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
          turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));
      gm.handlePlayerAction(roomId, 'B', 'fold');
      vi.advanceTimersByTime(5001);
      // 30 + 20 = 50, но cap 40 → 40
      const a = getState(gm, roomId).players.find((p) => p.id === 'A')!;
      expect(a.timebank).toBe(40);
    });
  });

  describe('Late entry', () => {
    it('late entry в playing-фазе → isFolded=true, без карт', async () => {
      const { gm, io, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Стол в playing, добавляем C
      const c = seatPlayer(gm, io, { roomId, userId: 'C', username: 'Carol', bankroll: 10_000, buyIn: 1000 });
      expect(c.success).toBe(true);
      const s = getState(gm, roomId, );
      const cInState = s.players.find((p) => p.id === 'C')!;
      expect(cInState.isFolded).toBe(true);
      // C не получает карт текущей раздачи (player.cards=[] для late entry)
      const stateForC = gm.getGameState(roomId, 'C') as StateView & {
        players: Array<{ id: string; cards?: unknown[] }>;
      };
      const cInOwnView = stateForC.players.find((p) => p.id === 'C')!;
      expect(cInOwnView.cards).toEqual([]);
    });

    it('late entry — следующая раздача: isFolded=false, есть карты', async () => {
      const { gm, io, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      seatPlayer(gm, io, { roomId, userId: 'C', username: 'Carol', bankroll: 10_000, buyIn: 1000 });
      // Прервать раздачу через fold
      gm.handlePlayerAction(roomId, 'B', 'fold');
      vi.advanceTimersByTime(5001);
      // После cleanup и нового startGame: C должен играть
      const s = getState(gm, roomId);
      // 3 игрока за столом, новая раздача
      const cInState = s.players.find((p) => p.id === 'C')!;
      // После cleanupHand isFolded=false
      expect(cInState.isFolded).toBe(false);
    });
  });

  describe('Disconnect handling', () => {
    it('disconnect в waiting → немедленный removePlayer, стек возвращается в банкролл', async () => {
      const { gm, io, roomId } = await setupTable(2);
      // status=waiting (не стартовали)
      const beforeStorage = getStorage('users.json') as Array<{ id: string; chips: number }>;
      const aBefore = beforeStorage.find((u) => u.id === 'A')!.chips;
      expect(aBefore).toBe(9000); // 10000 - 1000 buyIn
      gm.handleDisconnect('A');
      // A удалён, банкролл возвращён
      const afterStorage = getStorage('users.json') as Array<{ id: string; chips: number }>;
      const aAfter = afterStorage.find((u) => u.id === 'A')!.chips;
      expect(aAfter).toBe(10000);
      // A нет в комнате
      const s = getState(gm, roomId);
      expect(s.players.find((p) => p.id === 'A')).toBeUndefined();
    });

    it('disconnect не текущего игрока в playing → grace, disconnected=true', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Ход у B. Дисконнектим A (не текущий).
      gm.handleDisconnect('A');
      const s = getState(gm, roomId);
      const a = s.players.find((p) => p.id === 'A')!;
      expect(a.disconnected).toBe(true);
      // A всё ещё в комнате (grace 30с не истёк)
      expect(a).toBeDefined();
    });

    it('disconnect текущего игрока в playing → disconnected=true (НЕ мгновенный fold, см. §11.51)', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Ход у B. Дисконнектим B. После фикса §11.51 instant-fold убран:
      // B только помечается disconnected, fold случится по turn-timer или 30с grace.
      gm.handleDisconnect('B');
      const s = getState(gm, roomId);
      const b = s.players.find((p) => p.id === 'B')!;
      expect(b.disconnected).toBe(true);
      expect(b.isFolded).toBe(false);
    });

    it('reconnect внутри 30с — disconnected=false, стек сохранён', async () => {
      const { gm, io, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      gm.handleDisconnect('A');
      expect(getState(gm, roomId).players.find((p) => p.id === 'A')!.disconnected).toBe(true);
      // Реконнект через addPlayer (с тем же userId)
      const newSock = io.addSocket('A', 'A-name', roomId);
      const ok = gm.addPlayer(roomId, 'A', newSock.id, 'A-name');
      expect(ok).toBe(true);
      const a = getState(gm, roomId).players.find((p) => p.id === 'A')!;
      expect(a.disconnected).toBe(false);
      expect(a.chips).toBeGreaterThan(0);
    });

    it('disconnect timeout 30с → removePlayer, стек в банкролл', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Дисконнектим A (не текущий)
      gm.handleDisconnect('A');
      const aBefore = (getStorage('users.json') as Array<{ id: string; chips: number }>).find((u) => u.id === 'A')!.chips;
      // Прокручиваем 30 секунд
      vi.advanceTimersByTime(30_001);
      // A удалён, банкролл получает остаток стека
      const aAfter = (getStorage('users.json') as Array<{ id: string; chips: number }>).find((u) => u.id === 'A')!.chips;
      expect(aAfter).toBeGreaterThan(aBefore);
    });
  });

  describe('Auto-actions on timeout', () => {
    it('auto-CHECK для BB при тайм-ауте если SB call=0', async () => {
      const customSettings = {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, enabled: false },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'AutoCheckRoom2', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
          turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));
      // SB=B calls, BB=A не реагирует, таймер истекает → auto-CHECK
      gm.handlePlayerAction(roomId, 'B', 'call');
      // Сейчас ход у A. Прокручиваем 30 секунд.
      vi.advanceTimersByTime(30_001);
      const s = getState(gm, roomId);
      // BB auto-checked → фаза flop
      expect(s.phase).toBe('flop');
      // A НЕ folded — auto-CHECK
      expect(s.players.find((p) => p.id === 'A')!.isFolded).toBe(false);
    });

    it('auto-FOLD при тайм-ауте если call > 0', async () => {
      const customSettings = {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, enabled: false },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'AutoFoldRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
          turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));
      // SB=B raise 30, BB=A не реагирует. Call=20 > 0 → auto-FOLD.
      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      vi.advanceTimersByTime(30_001);
      // A auto-folded → B uncontested win
      const s = getState(gm, roomId);
      expect(s.players.find((p) => p.id === 'A')!.isFolded).toBe(true);
    });

    it('timebank Phase 2 запускается после Phase 1 timeout с timebank>0', async () => {
      // Timebank enabled, A имеет 30с
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Ход у B. B raise 30. A's turn.
      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      // Прокручиваем 30 секунд (Phase 1) → должен запуститься Phase 2
      vi.advanceTimersByTime(30_001);
      const s = getState(gm, roomId);
      // turnTimebankEndsAt — null если Phase 2 не запустилась; не-null если запустилась
      expect(s.turnTimebankEndsAt).not.toBeNull();
      // A не folded (Phase 2 ждёт)
      expect(s.players.find((p) => p.id === 'A')!.isFolded).toBe(false);
    });

    it('timebank exhausted → auto-action после Phase 2 timeout', async () => {
      // Override settings: timebank всего 2 секунды
      const customSettings = {
        turnDurationMs: 5_000, // короткий phase 1 для теста
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { ...TIMEBANK_SETTINGS, startSec: 2 },
        botMode: DEFAULT_BOT_MODE,
      };
      resetStorage({ settings: customSettings });
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        {
          name: 'TBExhRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
          turnDurationSec: 5, buyInMinBb: 20, buyInMaxBb: 100,
        },
        'system',
      );
      const roomId = (create as { roomId: string }).roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));
      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      // Phase 1: 5 sec, Phase 2: 2 sec. Total 7 sec.
      vi.advanceTimersByTime(7_001);
      const s = getState(gm, roomId);
      // A auto-folded (call > 0 после raise)
      expect(s.players.find((p) => p.id === 'A')!.isFolded).toBe(true);
    });
  });
});

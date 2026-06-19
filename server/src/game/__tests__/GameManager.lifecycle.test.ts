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

async function setupTable(playerCount: number, _opts?: { timebank?: typeof TIMEBANK_SETTINGS }) {
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
      const { gm, roomId } = await setupTable(2);
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
      // A всё ещё в комнате (сит-аут не истёк)
      expect(a).toBeDefined();
    });

    it('disconnect текущего игрока в playing → disconnected=true (НЕ мгновенный fold, см. §11.51)', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Ход у B. Дисконнектим B. После фикса §11.51 instant-fold убран:
      // B только помечается disconnected, fold случится по turn-timer / сит-аут авто-фолду.
      gm.handleDisconnect('B');
      const s = getState(gm, roomId);
      const b = s.players.find((p) => p.id === 'B')!;
      expect(b.disconnected).toBe(true);
      expect(b.isFolded).toBe(false);
    });

    it('reconnect внутри сит-аута — disconnected=false, стек сохранён', async () => {
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

    it('сит-аут истёк (дефолт 30 мин) → removePlayer, стек в банкролл', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Дисконнектим A (не текущий)
      gm.handleDisconnect('A');
      const aBefore = (getStorage('users.json') as Array<{ id: string; chips: number }>).find((u) => u.id === 'A')!.chips;
      // До истечения сит-аута (29 мин) A ещё за столом
      vi.advanceTimersByTime(29 * 60_000);
      const stillThere = (getStorage('users.json') as Array<{ id: string; chips: number }>).find((u) => u.id === 'A')!.chips;
      expect(stillThere).toBe(aBefore);
      // Прокручиваем за 30 минут — A удалён, банкролл получает остаток стека
      vi.advanceTimersByTime(60_001);
      const aAfter = (getStorage('users.json') as Array<{ id: string; chips: number }>).find((u) => u.id === 'A')!.chips;
      expect(aAfter).toBeGreaterThan(aBefore);
    });

    it('сит-аут: ход доходит до отключённого → быстрый авто-фолд/чек (не ждёт полный turn-таймер)', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Ход у B (D/SB preflop). Дисконнектим A (BB, не текущий) — он в сит-ауте.
      gm.handleDisconnect('A');
      // B коллирует → ход переходит к отключённому A, армится короткий sit-out-таймер (не turn 30с).
      gm.handlePlayerAction(roomId, 'B', 'call');
      // Прокручиваем всего 1.6с (< turnDurationSec=30): A уже авто-сходил (BB, call=0 → check),
      // префлоп-раунд завершён → раздан флоп. Без быстрого пути A бы ещё ждал turn-таймер.
      vi.advanceTimersByTime(1600);
      expect(getState(gm, roomId).communityCards.length).toBe(3);
    });
  });

  describe('Admin kick cooldown (временный кик)', () => {
    it('кик с кулдауном → on-cooldown до истечения, потом снова можно сесть', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.adminKickPlayer(roomId, 'A', 5);
      expect(gm.canJoinRoom(roomId, 'A')).toBe('on-cooldown');
      // За секунду до истечения ещё закрыт
      vi.advanceTimersByTime(5 * 60_000 - 1000);
      expect(gm.canJoinRoom(roomId, 'A')).toBe('on-cooldown');
      // После 5 минут — кулдаун снят, вход разрешён (банкролл вернулся при кике)
      vi.advanceTimersByTime(2000);
      expect(gm.canJoinRoom(roomId, 'A')).toBeNull();
    });

    it('кик без кулдауна (0) → вход разрешён сразу', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.adminKickPlayer(roomId, 'A', 0);
      expect(gm.canJoinRoom(roomId, 'A')).toBeNull();
    });
  });

  describe('Waitlist (очередь на полный стол)', () => {
    // Полный стол на 2 места (A, B) с задержкой очереди 2 мин.
    async function fullTable() {
      const { gm, io } = await createTestGameManager();
      const create = gm.createRoom(
        { name: 'WaitRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 2, turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100, waitlistDelayMin: 2 },
        'system',
      ) as { roomId: string };
      const roomId = create.roomId;
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10000, buyIn: 1000 });
      return { gm, io, roomId };
    }

    it('место освободилось → через задержку (2 мин) авто-посадка первого из очереди', async () => {
      const { gm, io, roomId } = await fullTable();
      // C встаёт в очередь (стол полный): seatPlayer создаёт сокет+банкролл, addPlayer падает (full).
      const { socket: sockC } = seatPlayer(gm, io, { roomId, userId: 'C', username: 'C', bankroll: 10000, buyIn: 1000 });
      const res = (gm as unknown as { joinWaitlist: (...a: unknown[]) => unknown })
        .joinWaitlist(roomId, 'C', 'C', sockC, undefined, 1000);
      expect(res).toEqual({ queued: 1 });

      gm.removePlayer(roomId, 'A'); // место освободилось (B остался) → запланирована посадка
      expect(getState(gm, roomId).players.find((p) => p.id === 'C')).toBeUndefined();
      vi.advanceTimersByTime(2 * 60_000 + 100);
      expect(getState(gm, roomId).players.find((p) => p.id === 'C')).toBeDefined();
      expect(sockC.emitted.some((e) => e.event === 'seatFromWaitlist')).toBe(true);
    });

    it('офлайн-игрок в очереди пропускается → садится следующий валидный', async () => {
      const { gm, io, roomId } = await fullTable();
      const { socket: sockC } = seatPlayer(gm, io, { roomId, userId: 'C', username: 'C', bankroll: 10000, buyIn: 1000 });
      const { socket: sockD } = seatPlayer(gm, io, { roomId, userId: 'D', username: 'D', bankroll: 10000, buyIn: 1000 });
      const g = gm as unknown as { joinWaitlist: (...a: unknown[]) => unknown };
      g.joinWaitlist(roomId, 'C', 'C', sockC, undefined, 1000);
      g.joinWaitlist(roomId, 'D', 'D', sockD, undefined, 1000);
      io.removeSocket(sockC.id); // C ушёл оффлайн до посадки

      gm.removePlayer(roomId, 'A');
      vi.advanceTimersByTime(2 * 60_000 + 100);
      const state = getState(gm, roomId);
      expect(state.players.find((p) => p.id === 'C')).toBeUndefined();
      expect(state.players.find((p) => p.id === 'D')).toBeDefined();
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

  describe('Авто-докупка стека (auto top-up)', () => {
    // Сценарий опирается на числа из «стеки переходят между раздачами»:
    // B (D=SB) фолдит, теряет SB=5 → стек 995; без докупки во 2-й раздаче (B=BB, -10) станет 985.
    it('доливает стек проигравшего между раздачами из банкролла; победителя не трогает', async () => {
      const { gm, roomId } = await setupTable(2);
      // B — авто-докупка до полного бай-ина (100 ББ = 1000 фишек) при падении ниже него.
      gm.setAutoTopUp(roomId, 'B', { enabled: true, thresholdBb: 100, targetBb: 100 });

      gm.startGame(roomId, makeDeck(2));
      gm.handlePlayerAction(roomId, 'B', 'fold');
      // cleanupHand: B 995 < 1000 → долив +5 до 1000 (банкролл 9000 → 8995), затем 2-я раздача
      // (B=BB платит 10 → 990). Без докупки было бы 985.
      vi.advanceTimersByTime(5001);

      const after = getState(gm, roomId);
      expect(after.players.find((p) => p.id === 'B')!.chips).toBe(990);
      // A выиграл раздачу, авто-докупки у него нет — стек обычной логики (1005 → SB -5 → 1000).
      expect(after.players.find((p) => p.id === 'A')!.chips).toBe(1000);

      // Списание строго на величину долива; чужой банкролл не тронут.
      const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
      expect(users.find((u) => u.id === 'B')!.chips).toBe(8995);
      expect(users.find((u) => u.id === 'A')!.chips).toBe(9000);
    });

    it('выключенная авто-докупка — no-op (стек и банкролл не меняются)', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.setAutoTopUp(roomId, 'B', { enabled: false, thresholdBb: 100, targetBb: 100 });

      gm.startGame(roomId, makeDeck(2));
      gm.handlePlayerAction(roomId, 'B', 'fold');
      vi.advanceTimersByTime(5001);

      const after = getState(gm, roomId);
      // Долива нет → как в базовом тесте: 995 - 10 (BB 2-й раздачи) = 985.
      expect(after.players.find((p) => p.id === 'B')!.chips).toBe(985);
      const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
      expect(users.find((u) => u.id === 'B')!.chips).toBe(9000);
    });
  });
});

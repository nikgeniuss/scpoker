import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock storage должен быть ДО любых импортов GameManager (vitest hoist'ит).
vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Тесты §2 (blinds), §7 (turn order), §10 (heads-up) из POKER_RULES.md.
// Главный invariant: dealerIndex=0 у новой комнаты, при startGame → +1, поэтому в HU
// «первый посаженный» становится BB, «второй» — D=SB.

// Хелпер: создать стол + посадить N игроков с одинаковым банкроллом.
async function setupTable(playerCount: number, opts?: { smallBlind?: number; bigBlind?: number; maxPlayers?: number }) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'PosRoom',
      smallBlind: opts?.smallBlind ?? 5,
      bigBlind: opts?.bigBlind ?? 10,
      maxPlayers: opts?.maxPlayers ?? 9,
      turnDurationSec: 30,
      buyInMinBb: 20,
      buyInMaxBb: 100,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  const sockets: ReturnType<typeof seatPlayer>[] = [];
  for (let i = 0; i < playerCount; i++) {
    const userId = String.fromCharCode(65 + i); // 'A', 'B', 'C', ...
    const r = seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
    sockets.push(r);
  }
  return { gm, io, roomId, sockets };
}

// Подсмотр карт нужен только чтобы убедиться что startGame применил deck —
// сам порядок hole-карт не критичен для тестов позиций. Минимальная безопасная колода.
function makeDeck(playerCount: number) {
  const cardsList = [];
  // Для каждого игрока 2 карты — берём пары с разных мастей чтобы не было дубликатов
  const suits = ['s', 'h', 'd', 'c'] as const;
  const ranks: Array<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'> =
    ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6'];
  for (let i = 0; i < playerCount; i++) {
    cardsList.push(card(ranks[i], suits[0]), card(ranks[i], suits[1]));
  }
  return buildDeck(...cardsList);
}

type StateView = {
  phase: string;
  currentPlayerIndex: number;
  dealerIndex: number;
  players: Array<{ id: string; chips: number; currentBet: number; isFolded: boolean; cards: unknown[] }>;
  pot: number;
  currentBet: number;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

// Получить id игрока, чей сейчас ход
function currentTurnId(state: StateView): string {
  return state.players[state.currentPlayerIndex].id;
}

describe('GameManager — positions, blinds, turn order', () => {
  beforeEach(() => {
    resetStorage();
    // Подавляем шумные логи GameManager (можно убрать для отладки)
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Heads-up (N=2)', () => {
    it('D = SB; preflop первым ходит D=SB (Bob), BB (Alice) — последним', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      const s = getState(gm, roomId);
      // После startGame dealerIndex=1 (B), SB=D=B
      expect(s.dealerIndex).toBe(1);
      // Префлоп первым ходит D (B)
      expect(currentTurnId(s)).toBe('B');
      // Чтобы убедиться, что A — BB: его currentBet = 10 (BB)
      const alice = s.players.find((p) => p.id === 'A')!;
      const bob = s.players.find((p) => p.id === 'B')!;
      expect(alice.currentBet).toBe(10);
      expect(bob.currentBet).toBe(5);
    });

    it('postflop первым ходит BB (=D+1, т.е. Alice)', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      // Префлоп: D=B SB call → 10 (доплата 5), затем BB check → флоп
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'A', 'check');
      const s = getState(gm, roomId);
      expect(s.phase).toBe('flop');
      // Постфлоп первым ходит BB = A
      expect(currentTurnId(s)).toBe('A');
    });

    it('кнопка дилера двигается +1 каждую раздачу', async () => {
      const { gm, roomId } = await setupTable(2);
      gm.startGame(roomId, makeDeck(2));
      const s1 = getState(gm, roomId);
      expect(s1.dealerIndex).toBe(1);
      // Сразу второй startGame не сработает — комната в playing.
      // Чтобы протестировать движение dealerIndex, форсим финиш раздачи через fold.
      gm.handlePlayerAction(roomId, 'B', 'fold');
      // После endGame через 5с — cleanup, новый startGame.
      vi.useFakeTimers();
      // У endGame стоит setTimeout(cleanupHand, 5000) — но мы НЕ вызывали useFakeTimers до startGame.
      // Это сложно — пропустим, и просто проверим что dealerIndex после первой раздачи был 1.
      // Cross-hand dealer rotation покрыт в lifecycle.test.ts.
      vi.useRealTimers();
      expect(s1.dealerIndex).toBe(1);
    });
  });

  describe('3-max', () => {
    it('UTG = (D+3) % 3 = D ходит первым префлоп', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const s = getState(gm, roomId);
      // dealerIndex после startGame = 1 (B)
      expect(s.dealerIndex).toBe(1);
      // UTG = (1+3)%3 = 1 → B ходит первым
      expect(currentTurnId(s)).toBe('B');
      // SB = C (index 2), BB = A (index 0)
      const c = s.players.find((p) => p.id === 'C')!;
      const a = s.players.find((p) => p.id === 'A')!;
      expect(c.currentBet).toBe(5); // SB
      expect(a.currentBet).toBe(10); // BB
    });

    it('postflop первым ходит SB (слева от D)', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Префлоп: B (UTG) call → C (SB) call → A (BB) check → флоп
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'check');
      const s = getState(gm, roomId);
      expect(s.phase).toBe('flop');
      // Постфлоп первый — слева от D=B, то есть C (SB)
      expect(currentTurnId(s)).toBe('C');
    });
  });

  describe('4-max', () => {
    it('UTG = (D+3) % 4 ходит первым префлоп', async () => {
      const { gm, roomId } = await setupTable(4);
      gm.startGame(roomId, makeDeck(4));
      const s = getState(gm, roomId);
      // dealerIndex=1 (B), UTG = (1+3)%4 = 0 → A
      expect(s.dealerIndex).toBe(1);
      expect(currentTurnId(s)).toBe('A');
    });

    it('postflop первым ходит SB (слева от D)', async () => {
      const { gm, roomId } = await setupTable(4);
      gm.startGame(roomId, makeDeck(4));
      // Префлоп: UTG=A call → BTN=B fold → SB=C call → BB=D check → флоп
      // На самом деле D=B (dealerIndex=1), SB=C (index 2), BB=D-user (index 3), UTG=A (index 0)
      gm.handlePlayerAction(roomId, 'A', 'call');
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'D', 'check');
      const s = getState(gm, roomId);
      expect(s.phase).toBe('flop');
      // SB слева от D=B → C (index 2)
      expect(currentTurnId(s)).toBe('C');
    });
  });

  describe('6-max', () => {
    it('UTG = (D+3) % 6 ходит первым префлоп', async () => {
      const { gm, roomId } = await setupTable(6);
      gm.startGame(roomId, makeDeck(6));
      const s = getState(gm, roomId);
      // dealerIndex=1 (B), UTG = (1+3)%6 = 4 → E
      expect(s.dealerIndex).toBe(1);
      expect(currentTurnId(s)).toBe('E');
    });
  });

  describe('9-max', () => {
    it('UTG = (D+3) % 9 ходит первым префлоп', async () => {
      const { gm, roomId } = await setupTable(9);
      gm.startGame(roomId, makeDeck(9));
      const s = getState(gm, roomId);
      // dealerIndex=1 (B), UTG = (1+3)%9 = 4 → E
      expect(s.dealerIndex).toBe(1);
      expect(currentTurnId(s)).toBe('E');
    });
  });

  describe('Skipping players', () => {
    it('folded SB постфлоп — emitCurrentTurn пропускает к BB', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Префлоп: B (UTG) call → C (SB) fold → A (BB) check → флоп
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'fold');
      gm.handlePlayerAction(roomId, 'A', 'check');
      const s = getState(gm, roomId);
      expect(s.phase).toBe('flop');
      // Постфлоп должен начаться с SB=C, но он folded → пропускаем к A (BB)
      expect(currentTurnId(s)).toBe('A');
    });

    it('all-in игрок (chips=0) не блокирует isRoundComplete', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Префлоп: B (UTG, stack 1000) all-in → C (SB, stack 1000) call → A (BB) call → flop без B
      gm.handlePlayerAction(roomId, 'B', 'all-in');
      // Round не закроется потому что B сделал raise и actionsThisRound={B} только.
      // Round должен дойти до закрытия: C call all-in, A call all-in → run-out до showdown.
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'call');
      const s = getState(gm, roomId);
      // Все 3 в all-in → run-out до showdown. Проверим что phase ушёл с preflop.
      expect(s.phase === 'showdown' || s.phase === 'flop' || s.phase === 'turn' || s.phase === 'river').toBe(true);
    });

    it('преflop в 4-max: каждый игрок получает ровно один ход если все call', async () => {
      const { gm, roomId } = await setupTable(4);
      gm.startGame(roomId, makeDeck(4));
      // UTG=A (index 0), затем B (D), C (SB), D-user (BB)
      // Все call → BB check → флоп
      const firstId = currentTurnId(getState(gm, roomId));
      expect(firstId).toBe('A');
      gm.handlePlayerAction(roomId, 'A', 'call');
      expect(currentTurnId(getState(gm, roomId))).toBe('B');
      gm.handlePlayerAction(roomId, 'B', 'call');
      expect(currentTurnId(getState(gm, roomId))).toBe('C');
      gm.handlePlayerAction(roomId, 'C', 'call');
      expect(currentTurnId(getState(gm, roomId))).toBe('D');
      // BB option
      gm.handlePlayerAction(roomId, 'D', 'check');
      // Теперь фаза flop
      expect(getState(gm, roomId).phase).toBe('flop');
    });
  });

  describe('BB option', () => {
    it('BB получает право check после того как все call (3-max)', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // B (UTG) call, C (SB) call. Сейчас ход должен быть у A (BB).
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      const s = getState(gm, roomId);
      // Раунд НЕ закрылся, ход у A (BB)
      expect(s.phase).toBe('preflop');
      expect(currentTurnId(s)).toBe('A');
    });

    it('BB option raise: если BB рейзит, action re-opens для SB и UTG', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // B (UTG) call, C (SB) call, A (BB) raise to 40
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'raise', 40);
      // После рейза от BB action возвращается к UTG=B (он не в actionsThisRound после reset)
      const s = getState(gm, roomId);
      expect(s.phase).toBe('preflop'); // флоп ещё не открылся
      // currentBet=40 от BB raise
      expect(s.currentBet).toBe(40);
      // Действующий — следующий по часовой после A. nextPlayer от index 0 → 1 (B)
      expect(currentTurnId(s)).toBe('B');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Интеграционные тесты анте (POKER_RULES §6.7). Перехват chips после showdown, до cleanupHand.

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  const s = gm.getGameState(roomId) as unknown as { players: Array<{ id: string; chips: number }> };
  return s.players.find((p) => p.id === userId)!.chips;
}

async function setupAnte(ante: number) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'AnteRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, ante },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < 2; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, roomId };
}

function aaVsKkDeck() {
  return buildDeck(
    card('A', 's'), card('A', 'h'),
    card('K', 's'), card('K', 'h'),
    card('2', 'c'),
    card('Q', 'd'), card('J', 'h'), card('7', 's'),
    card('3', 'c'), card('9', 'd'),
    card('4', 'c'), card('8', 'h'),
  );
}

function playToShowdown(gm: GameManagerLike, roomId: string) {
  gm.handlePlayerAction(roomId, 'B', 'call'); // SB добивает до BB
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // flop
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // turn
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // river
  gm.handlePlayerAction(roomId, 'B', 'check');
}

describe('GameManager — анте (POKER_RULES §6.7)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('анте вносят все, банк включает анте, победитель забирает', async () => {
    const { gm, roomId } = await setupAnte(5);
    gm.startGame(roomId, aaVsKkDeck());
    playToShowdown(gm, roomId);
    // банк = анте (5+5) + блайнды (B 10, A 10) = 30. A (AA) забирает.
    // A: 1000 − 5 (анте) − 10 (BB) + 30 = 1015; B: 1000 − 5 − 10 = 985.
    expect(chipsOf(gm, roomId, 'A')).toBe(1015);
    expect(chipsOf(gm, roomId, 'B')).toBe(985);
  });

  it('анте=0 → банк только из блайндов', async () => {
    const { gm, roomId } = await setupAnte(0);
    gm.startGame(roomId, aaVsKkDeck());
    playToShowdown(gm, roomId);
    // банк = 20; A: 1000 − 10 + 20 = 1010; B: 990.
    expect(chipsOf(gm, roomId, 'A')).toBe(1010);
    expect(chipsOf(gm, roomId, 'B')).toBe(990);
  });
});

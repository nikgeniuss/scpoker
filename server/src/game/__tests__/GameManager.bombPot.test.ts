import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): Bomb Pot — все вносят 3×BB, флоп раздаётся сразу без префлоп-торгов.

type StateView = {
  phase: string;
  currentPlayerIndex: number;
  currentBet: number;
  pot: number;
  communityCards: Array<{ rank: string; suit: string }>;
  players: Array<{ id: string; chips: number }>;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function headsUpDeck() {
  return buildDeck(card('2', 's'), card('3', 's'), card('4', 's'), card('5', 's'));
}

async function setupRoom(bombPotEnabled: boolean) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'BombPotRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, bombPotEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
  return { gm, roomId };
}

describe('GameManager — Bomb Pot (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён → все вносят 3×BB, фаза сразу flop с 3 картами, торгов префлоп не было', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, headsUpDeck());
    const s = getState(gm, roomId);
    expect(s.phase).toBe('flop');
    expect(s.communityCards).toHaveLength(3);
    expect(s.pot).toBe(60); // 30 (A) + 30 (B), 3×BB=30 каждый
    expect(s.currentBet).toBe(0); // нет ставки к коллу — свежий постфлоп-раунд
    s.players.forEach((p) => expect(p.chips).toBe(970)); // 1000 − 30
  });

  it('выключен → обычное поведение (префлоп, блайнды, без форс-бета)', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, headsUpDeck());
    const s = getState(gm, roomId);
    expect(s.phase).toBe('preflop');
    expect(s.communityCards).toHaveLength(0);
    expect(s.pot).toBe(15); // SB(5) + BB(10)
  });
});

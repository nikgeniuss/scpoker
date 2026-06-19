import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer } from './helpers/gameManager.js';

beforeEach(() => resetStorage());

interface CardLike { rank: string; suit: string }
interface StateLike {
  format: string;
  communityCards: CardLike[];
  futureBoard?: CardLike[];
  players: Array<{ id: string; cards: CardLike[] }>;
}

const LOW = ['2', '3', '4', '5'];

describe('GameManager — Шорт-дэк стол', () => {
  it('раздаёт колоду без 2–5 и отдаёт format=shortdeck в state', async () => {
    const { gm, io } = await createTestGameManager();
    const created = gm.createRoom(
      {
        name: 'ShortDeckRoom',
        smallBlind: 50,
        bigBlind: 100,
        maxPlayers: 6,
        turnDurationSec: 30,
        buyInMinBb: 10,
        buyInMaxBb: 200,
        format: 'shortdeck',
      },
      'sys',
    );
    if ('error' in created) throw new Error(created.error);
    const roomId = created.roomId;

    seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 100000, buyIn: 10000 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 100000, buyIn: 10000 });
    gm.startGame(roomId);

    // withPeek=true → видны карты всех игроков + будущий борд (для проверки колоды).
    const state = gm.getGameState(roomId, 'A', true) as StateLike;
    expect(state.format).toBe('shortdeck');

    const allCards: CardLike[] = [
      ...state.communityCards,
      ...(state.futureBoard ?? []),
      ...state.players.flatMap((p) => p.cards),
    ];
    expect(allCards.length).toBeGreaterThan(0);
    expect(allCards.some((c) => LOW.includes(c.rank))).toBe(false);
  });

  it('обычный стол остаётся NLH (format=nlh по умолчанию)', async () => {
    const { gm, io } = await createTestGameManager();
    const created = gm.createRoom(
      { name: 'NlhRoom', smallBlind: 50, bigBlind: 100, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 10, buyInMaxBb: 200 },
      'sys',
    ) as { roomId: string };
    seatPlayer(gm, io, { roomId: created.roomId, userId: 'A', username: 'Alice', bankroll: 100000, buyIn: 10000 });
    seatPlayer(gm, io, { roomId: created.roomId, userId: 'B', username: 'Bob', bankroll: 100000, buyIn: 10000 });
    gm.startGame(created.roomId);
    const state = gm.getGameState(created.roomId, 'A', true) as StateLike;
    expect(state.format).toBe('nlh');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): No Turn No Show — победитель без вскрытия автоматически
// показывает карты (анти-чит), вместо текущего «скрыто до добровольного тапа».

type Card2 = { rank: string; suit: string };
type StateView = {
  players: Array<{ id: string; cards: Card2[]; revealedCards?: number[]; shownCards?: (Card2 | null)[] }>;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function headsUpDeck() {
  return buildDeck(card('A', 's'), card('A', 'h'), card('K', 's'), card('K', 'h'));
}

async function setupRoom(noTurnNoShowEnabled: boolean) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'NoTurnRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, noTurnNoShowEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
  return { gm, roomId };
}

describe('GameManager — No Turn No Show (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён + выигрыш без вскрытия → карты победителя автораскрыты (shownCards)', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, headsUpDeck());
    // Heads-up: dealerIndex=1=SB=B, BB=A. B первый ходит (SB) — фолдит, A забирает банк без вскрытия.
    gm.handlePlayerAction(roomId, 'B', 'fold');
    const s = getState(gm, roomId);
    const winner = s.players.find((p) => p.id === 'A')!;
    expect(winner.revealedCards).toEqual([0, 1]);
    expect(winner.shownCards).toBeDefined();
    expect(winner.shownCards!.filter((c) => c !== null)).toHaveLength(2);
  });

  it('выключен (по умолчанию) → карты победителя остаются скрытыми', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, headsUpDeck());
    gm.handlePlayerAction(roomId, 'B', 'fold');
    const s = getState(gm, roomId);
    const winner = s.players.find((p) => p.id === 'A')!;
    expect(winner.revealedCards).toBeUndefined();
    expect(winner.shownCards).toBeUndefined();
  });
});

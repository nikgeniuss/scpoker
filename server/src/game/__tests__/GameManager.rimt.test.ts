import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): RIMT — ранний all-in до ривера доигрывается ДВАЖДЫ автоматически.

type StateView = {
  phase: string;
  settlementMode?: string;
  communityCards: Array<{ rank: string; suit: string }>;
  communityCardsB?: Array<{ rank: string; suit: string }>;
  players: Array<{ id: string; chips: number }>;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
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

async function setupRoom(rimtEnabled: boolean, evCashoutEnabled = false) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'RimtRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, rimtEnabled, evCashoutEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
  return { gm, roomId };
}

describe('GameManager — RIMT (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён + all-in префлоп → борд решается дважды, банк не теряется', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'all-in'); // SB первый ходит в heads-up
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    const s = getState(gm, roomId);
    expect(s.phase).toBe('showdown');
    expect(s.settlementMode).toBe('rimt');
    expect(s.communityCards).toHaveLength(5);
    expect(s.communityCardsB).toHaveLength(5);
    const total = s.players.reduce((acc, p) => acc + p.chips, 0);
    expect(total).toBe(2000); // целостность банка, без рейка
  });

  it('выключен → обычный одиночный доигрыш без RIMT', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    const s = getState(gm, roomId);
    expect(s.phase).toBe('showdown');
    expect(s.settlementMode).toBeUndefined();
    expect(s.communityCards).toHaveLength(5);
    expect(s.communityCardsB).toBeUndefined();
    const total = s.players.reduce((acc, p) => acc + p.chips, 0);
    expect(total).toBe(2000);
  });
});

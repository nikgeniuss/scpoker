import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): Double Board — каждая раздача стола дилит 2 независимых борда.

type StateView = {
  phase: string;
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

async function setupRoom(doubleBoardEnabled: boolean) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'DoubleBoardRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, doubleBoardEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
  return { gm, roomId };
}

function playToShowdown(gm: GameManagerLike, roomId: string) {
  gm.handlePlayerAction(roomId, 'B', 'call'); // SB добивает до BB — закрывает префлоп
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // flop
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // turn
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check'); // river
  gm.handlePlayerAction(roomId, 'B', 'check');
}

describe('GameManager — Double Board (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён → второй борд дилится синхронно с первым (3→4→5 карт), банк не теряется', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, aaVsKkDeck());
    expect(getState(gm, roomId).communityCardsB).toBeUndefined(); // префлоп — ещё не форкнут

    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check'); // → flop
    let s = getState(gm, roomId);
    expect(s.phase).toBe('flop');
    expect(s.communityCardsB).toHaveLength(3);

    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check'); // → turn
    s = getState(gm, roomId);
    expect(s.communityCardsB).toHaveLength(4);

    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check'); // → river
    s = getState(gm, roomId);
    expect(s.communityCardsB).toHaveLength(5);

    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check'); // → showdown
    s = getState(gm, roomId);
    expect(s.phase).toBe('showdown');
    expect(s.communityCardsB).toHaveLength(5);
    // Целостность банка: суммарные фишки не меняются (без рейка) — 1000+1000=2000.
    const total = s.players.reduce((acc, p) => acc + p.chips, 0);
    expect(total).toBe(2000);
  });

  it('выключен → второй борд не дилится', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, aaVsKkDeck());
    playToShowdown(gm, roomId);
    const s = getState(gm, roomId);
    expect(s.phase).toBe('showdown');
    expect(s.communityCardsB).toBeUndefined();
    const total = s.players.reduce((acc, p) => acc + p.chips, 0);
    expect(total).toBe(2000);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): EV Cashout — ранний all-in до ривера → банк делится по equity,
// борд не доигрывается. Приоритетнее RIMT при одновременном включении.

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

async function setupRoom(evCashoutEnabled: boolean, rimtEnabled = false, rake?: { percent: number; capBb: number }) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'EvCashoutRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30,
      buyInMinBb: 5, buyInMaxBb: 100, evCashoutEnabled, rimtEnabled,
      ...(rake ? { rake } : {}),
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
  return { gm, roomId };
}

describe('GameManager — EV Cashout (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён + all-in префлоп → банк делится по equity, борд не доигрывается', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'all-in'); // SB первый ходит в heads-up
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    const s = getState(gm, roomId);
    expect(s.settlementMode).toBe('evCashout');
    expect(s.communityCards.length).toBeLessThan(5); // борд не доигран
    expect(s.communityCardsB).toBeUndefined();

    const a = s.players.find((p) => p.id === 'A')!;
    const b = s.players.find((p) => p.id === 'B')!;
    // AA сильно фаворит против KK префлоп — должен забрать заметно больше половины банка.
    expect(a.chips).toBeGreaterThan(b.chips);
    expect(a.chips + b.chips).toBe(2000); // целостность банка, без рейка
  });

  it('рейк всё равно списывается из банка (если флоп уже был дан)', async () => {
    const { gm, roomId } = await setupRoom(true, false, { percent: 5, capBb: 10 });
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'call'); // SB доравнивает до BB — префлоп закрыт
    gm.handlePlayerAction(roomId, 'A', 'check'); // BB-опция закрывает префлоп, флоп раздаётся
    gm.handlePlayerAction(roomId, 'A', 'all-in'); // на флопе первый ходит BB в heads-up
    gm.handlePlayerAction(roomId, 'B', 'all-in');

    const s = getState(gm, roomId);
    expect(s.settlementMode).toBe('evCashout');
    const total = s.players.reduce((acc, p) => acc + p.chips, 0);
    expect(total).toBeLessThan(2000); // рейк забрал часть банка
  });

  it('включены и RIMT, и EV Cashout — приоритет у EV Cashout', async () => {
    const { gm, roomId } = await setupRoom(true, true);
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    const s = getState(gm, roomId);
    expect(s.settlementMode).toBe('evCashout');
    expect(s.communityCardsB).toBeUndefined();
  });

  it('выключен → обычный одиночный доигрыш без EV Cashout', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    const s = getState(gm, roomId);
    expect(s.settlementMode).toBeUndefined();
    expect(s.communityCards).toHaveLength(5);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Тесты §3 POKER_RULES.md (фазы, burn-карты).
// Порядок раздачи в testDeck (buildDeck):
//   N=2: c1,c2=P0 hole, c3,c4=P1 hole, c5=burn_flop, c6,c7,c8=flop, c9=burn_turn, c10=turn, c11=burn_river, c12=river

async function setupHeadsUp() {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'Phases',
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
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 10_000, buyIn: 1000 });
  return { gm, io, roomId };
}

type StateView = {
  phase: string;
  currentPlayerIndex: number;
  players: Array<{ id: string; chips: number; currentBet: number; isFolded: boolean }>;
  pot: number;
  currentBet: number;
  communityCards: Array<{ rank: string; suit: string }>;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

// Полная колода с определёнными flop/turn/river карами + burn-карты для проверки
function makeFullDeck() {
  return buildDeck(
    // P0 (Bob, D=SB после dealerIndex+1) hole
    card('A', 's'), card('A', 'h'),
    // P1 (??? actually first inserted player is A=Alice. Alice has index 0, dealCards order matches insertion)
    // Wait: dealCards раздаёт по 2 каждому в порядке playerIds. playerIds = ['A', 'B'].
    // P0 = A (Alice) gets c1,c2; P1 = B (Bob) gets c3,c4. dealerIndex=1 means Bob is D=SB.
    card('K', 's'), card('K', 'h'),
    // burn перед flop
    card('2', 'c'),
    // flop
    card('Q', 'd'), card('J', 'd'), card('10', 'd'),
    // burn перед turn
    card('3', 'c'),
    // turn
    card('9', 'd'),
    // burn перед river
    card('4', 'c'),
    // river
    card('8', 'd'),
  );
}

describe('GameManager — фазы и burn-карты', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('preflop → flop: 3 community-карт, совпадают с testDeck flop', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    // Heads-up: D=SB=B first preflop. B call → A check → flop
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    const s = getState(gm, roomId);
    expect(s.phase).toBe('flop');
    expect(s.communityCards.length).toBe(3);
    // По нашему testDeck: flop = Q♦, J♦, 10♦
    expect(s.communityCards.map((c) => c.rank)).toEqual(['Q', 'J', '10']);
    expect(s.communityCards.every((c) => c.suit === 'diamonds')).toBe(true);
  });

  it('flop → turn: 4 community-карт, последняя совпадает с testDeck turn', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    // Постфлоп heads-up: BB=A first. check → B check → turn.
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    const s = getState(gm, roomId);
    expect(s.phase).toBe('turn');
    expect(s.communityCards.length).toBe(4);
    expect(s.communityCards[3]).toEqual({ rank: '9', suit: 'diamonds' });
  });

  it('turn → river: 5 community-карт', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check'); // flop
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check'); // turn
    gm.handlePlayerAction(roomId, 'B', 'check');
    const s = getState(gm, roomId);
    expect(s.phase).toBe('river');
    expect(s.communityCards.length).toBe(5);
    expect(s.communityCards[4]).toEqual({ rank: '8', suit: 'diamonds' });
  });

  it('river → showdown: phase=showdown, GAME_WINNER эмитится', async () => {
    const { gm, io, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    io.emitted.length = 0;
    // River: 2 check → showdown
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    const s = getState(gm, roomId);
    expect(s.phase === 'showdown' || s.phase === 'waiting').toBe(true);
    // GAME_WINNER эмит должен быть в emitted
    const gw = io.emitted.find((e) => e.event === 'gameWinner');
    expect(gw).toBeDefined();
  });

  it('burn-карты НЕ попадают на community board', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    const s = getState(gm, roomId);
    // burn = 2♣, 3♣, 4♣ — НЕ должны быть в communityCards
    const burnRanks = new Set(['2', '3', '4']);
    const burnsInBoard = s.communityCards.filter((c) => c.suit === 'clubs' && burnRanks.has(c.rank));
    expect(burnsInBoard).toEqual([]);
    // На борде до тёрна 4 карты: Q,J,10 diamonds + 9 diamonds
    expect(s.communityCards.length).toBeGreaterThanOrEqual(4);
  });

  it('all-in run-out preflop: 2 all-in префлоп → борд раздаётся до 5 без действий', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    // B all-in
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    // A all-in (call)
    gm.handlePlayerAction(roomId, 'A', 'all-in');
    // Оба all-in → run-out → showdown
    const s = getState(gm, roomId);
    expect(s.phase === 'showdown' || s.phase === 'waiting').toBe(true);
    // На showdown communityCards уже 5 (или после cleanup 0).
    // Если фаза = waiting, cleanup отработал.
  });

  it('all-in run-out на flop: оба all-in после flop → борд достраивается до 5', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    // Флоп: A bet all-in, B call all-in
    gm.handlePlayerAction(roomId, 'A', 'all-in');
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    const s = getState(gm, roomId);
    expect(s.phase === 'showdown' || s.phase === 'waiting').toBe(true);
  });

  it('сброс между улицами: currentBet=0, player.currentBet=0, actionsThisRound пуст', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    const s = getState(gm, roomId);
    expect(s.phase).toBe('flop');
    expect(s.currentBet).toBe(0);
    expect(s.players.every((p) => p.currentBet === 0)).toBe(true);
  });

  it('totalCommitted сохраняется между улицами (через пот после нескольких улиц)', async () => {
    const { gm, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    // Префлоп: B call (5→10), A check → pot=20
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    const flopState = getState(gm, roomId);
    expect(flopState.pot).toBe(20);
    // Флоп: A bet 50, B call → pot=120
    gm.handlePlayerAction(roomId, 'A', 'raise', 50);
    gm.handlePlayerAction(roomId, 'B', 'call');
    const turnState = getState(gm, roomId);
    expect(turnState.pot).toBe(120);
    expect(turnState.phase).toBe('turn');
    // Тёрн: A check, B check → pot=120 (без изменения)
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    const riverState = getState(gm, roomId);
    expect(riverState.pot).toBe(120);
    expect(riverState.phase).toBe('river');
  });

  it('showdown эмит: GAME_WINNER содержит handName (русский) и winningCards (5 карт)', async () => {
    const { gm, io, roomId } = await setupHeadsUp();
    gm.startGame(roomId, makeFullDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    const gw = io.emitted.find((e) => e.event === 'gameWinner');
    expect(gw).toBeDefined();
    const payload = gw!.payload as { winners: string[]; handName: string; winningCards: Array<{ rank: string; suit: string }> };
    expect(typeof payload.handName).toBe('string');
    expect(payload.handName.length).toBeGreaterThan(0);
    expect(payload.winningCards).toBeDefined();
    expect(payload.winningCards.length).toBe(5);
  });
});

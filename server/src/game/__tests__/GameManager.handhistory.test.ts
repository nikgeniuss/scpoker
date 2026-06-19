import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';
import { recordHand, getHandsForUser, type HandHistoryRecord } from '../handHistory.js';

// Тесты истории раздач (ROADMAP §10.10): (1) снимок раздачи пишется из endGame через handRecorder
// с корректными полями (борд, карманные, revealed, net, winners); (2) приватность §0.1 в getHandsForUser.

describe('История раздач — снимок из endGame (handRecorder)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('heads-up до showdown: снимок с бордом, revealed у обоих, net и победителем', async () => {
    const { gm, io } = await createTestGameManager();
    type WithRec = GameManagerLike & { handRecorder?: (r: Omit<HandHistoryRecord, 'id'>) => void };
    const captured: Omit<HandHistoryRecord, 'id'>[] = [];
    (gm as WithRec).handRecorder = (r) => captured.push(r);

    const create = gm.createRoom(
      { name: 'HistRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100 },
      'system',
    );
    if ('error' in create) throw new Error(create.error);
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 10_000, buyIn: 1000 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 10_000, buyIn: 1000 });

    // A=AA, B=KK, нейтральный борд — A выигрывает на showdown (как в pots-тесте).
    const deck = buildDeck(
      card('A', 's'), card('A', 'h'), // P0 = A
      card('K', 's'), card('K', 'h'), // P1 = B
      card('2', 'c'),
      card('Q', 'd'), card('J', 'h'), card('7', 's'),
      card('3', 'c'), card('9', 'd'),
      card('4', 'c'), card('8', 'h'),
    );
    gm.startGame(roomId, deck);
    // Heads-up: B=D=SB ходит первым. Чек-даун до showdown.
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');

    expect(captured).toHaveLength(1);
    const rec = captured[0];
    expect(rec.board).toHaveLength(5);
    expect(rec.winners).toEqual(['A']);
    expect(rec.handName).toBeTruthy();
    const a = rec.players.find((p) => p.id === 'A')!;
    const b = rec.players.find((p) => p.id === 'B')!;
    // Оба дошли до showdown → revealed, карманные сохранены.
    expect(a.revealed).toBe(true);
    expect(b.revealed).toBe(true);
    expect(a.cards).toHaveLength(2);
    expect(b.cards).toHaveLength(2);
    // net: A выиграл банк 20 (вложил 10) = +10; B = -10.
    expect(a.net).toBe(10);
    expect(b.net).toBe(-10);
    expect(a.folded).toBe(false);
    // Лог действий для replay: блайнды + ходы.
    const types = rec.actions.map((x) => x.type);
    expect(types).toContain('sb');
    expect(types).toContain('bb');
    expect(types).toContain('call'); // B доколлил блайнд
    expect(types).toContain('check');
    expect(rec.actions.length).toBeGreaterThanOrEqual(6);
  });
});

describe('История раздач — приватность getHandsForUser (§0.1)', () => {
  beforeEach(() => resetStorage());

  it('свои карманные видны всегда; чужие — только revealed; сфолженные скрыты', () => {
    const baseRec: Omit<HandHistoryRecord, 'id'> = {
      t: 1000,
      roomId: 'r1',
      roomName: 'R',
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      board: [card('2', 'c'), card('7', 'd'), card('9', 's'), card('J', 'h'), card('Q', 'c')],
      pot: 100,
      rake: 0,
      winners: ['B'],
      winAmounts: { B: 100 },
      handName: 'Пара',
      players: [
        { id: 'A', username: 'Alice', cards: [card('A', 's'), card('A', 'h')], folded: false, revealed: true, net: -50 },
        { id: 'B', username: 'Bob', cards: [card('K', 's'), card('K', 'h')], folded: false, revealed: true, net: 100 },
        { id: 'C', username: 'Carol', cards: [card('5', 's'), card('6', 'h')], folded: true, revealed: false, net: -50 },
      ],
      actions: [],
    };
    recordHand(baseRec);

    const forA = getHandsForUser('A', 10);
    expect(forA).toHaveLength(1);
    const h = forA[0];
    // Свои (A) — видны.
    expect(h.players.find((p) => p.id === 'A')!.cards).toHaveLength(2);
    // Чужой B дошёл до showdown (revealed) — видны.
    expect(h.players.find((p) => p.id === 'B')!.cards).toHaveLength(2);
    // Чужой C сфолдил (revealed=false) — скрыты.
    expect(h.players.find((p) => p.id === 'C')!.cards).toHaveLength(0);
  });

  it('возвращает только раздачи, где участвовал юзер', () => {
    const mk = (id: string, players: string[]): Omit<HandHistoryRecord, 'id'> => ({
      t: 1000,
      roomId: id,
      roomName: 'R',
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      board: [],
      pot: 0,
      rake: 0,
      winners: [],
      winAmounts: {},
      players: players.map((pid) => ({ id: pid, username: pid, cards: [], folded: false, revealed: false, net: 0 })),
      actions: [],
    });
    recordHand(mk('r1', ['A', 'B']));
    recordHand(mk('r2', ['B', 'C']));

    expect(getHandsForUser('A', 10)).toHaveLength(1);
    expect(getHandsForUser('B', 10)).toHaveLength(2);
    expect(getHandsForUser('Z', 10)).toHaveLength(0);
  });
});

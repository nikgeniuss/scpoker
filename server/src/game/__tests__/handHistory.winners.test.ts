import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage } from './helpers/storage.js';
import { recordHand, getRecentWinnersForRoom, type HandHistoryRecord } from '../handHistory.js';

// История победителей стола (ROADMAP §10.4): публичная сводка без карманных карт.

beforeEach(() => clearStorage());

const baseHand = (over: Partial<Omit<HandHistoryRecord, 'id'>> = {}): Omit<HandHistoryRecord, 'id'> => ({
  t: Date.now(),
  roomId: 'room1',
  roomName: 'Test',
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  board: [],
  pot: 100,
  rake: 0,
  winners: ['u1'],
  winAmounts: { u1: 100 },
  players: [
    { id: 'u1', username: 'Alice', cards: [], folded: false, revealed: true, net: 100 },
    { id: 'u2', username: 'Bob', cards: [], folded: true, revealed: false, net: -100 },
  ],
  actions: [],
  ...over,
});

describe('getRecentWinnersForRoom', () => {
  it('возвращает победителя с именем и суммой', () => {
    recordHand(baseHand());
    const result = getRecentWinnersForRoom('room1');
    expect(result).toHaveLength(1);
    expect(result[0].winners).toEqual([{ id: 'u1', username: 'Alice', amount: 100 }]);
  });

  it('handName присутствует только при реальном вскрытии', () => {
    recordHand(baseHand({ handName: 'Two Pair' }));
    recordHand(baseHand()); // uncontested — handName не задан
    const result = getRecentWinnersForRoom('room1');
    expect(result[0].handName).toBeUndefined(); // новые сверху — второй вызов (uncontested)
    expect(result[1].handName).toBe('Two Pair');
  });

  it('фильтрует по roomId — раздачи другого стола не попадают', () => {
    recordHand(baseHand({ roomId: 'room1' }));
    recordHand(baseHand({ roomId: 'room2' }));
    expect(getRecentWinnersForRoom('room1')).toHaveLength(1);
    expect(getRecentWinnersForRoom('room2')).toHaveLength(1);
  });

  it('новые раздачи — первыми в списке', () => {
    recordHand(baseHand({ winners: ['u1'], winAmounts: { u1: 50 } }));
    recordHand(baseHand({ winners: ['u2'], winAmounts: { u2: 200 }, players: [
      { id: 'u1', username: 'Alice', cards: [], folded: true, revealed: false, net: -200 },
      { id: 'u2', username: 'Bob', cards: [], folded: false, revealed: true, net: 200 },
    ] }));
    const result = getRecentWinnersForRoom('room1');
    expect(result[0].winners[0].username).toBe('Bob');
    expect(result[1].winners[0].username).toBe('Alice');
  });

  it('ограничивает выдачу limit-ом', () => {
    for (let i = 0; i < 15; i++) recordHand(baseHand());
    expect(getRecentWinnersForRoom('room1', 10)).toHaveLength(10);
  });

  it('split pot — несколько победителей, сумма каждого своя', () => {
    recordHand(baseHand({
      winners: ['u1', 'u2'],
      winAmounts: { u1: 50, u2: 50 },
      players: [
        { id: 'u1', username: 'Alice', cards: [], folded: false, revealed: true, net: 50 },
        { id: 'u2', username: 'Bob', cards: [], folded: false, revealed: true, net: 50 },
      ],
    }));
    const result = getRecentWinnersForRoom('room1');
    expect(result[0].winners).toEqual([
      { id: 'u1', username: 'Alice', amount: 50 },
      { id: 'u2', username: 'Bob', amount: 50 },
    ]);
  });

  it('пустая история стола — пустой массив', () => {
    expect(getRecentWinnersForRoom('ghost-room')).toEqual([]);
  });
});

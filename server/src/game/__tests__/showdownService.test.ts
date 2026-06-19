import { describe, it, expect } from 'vitest';
import { resolveShowdown, type ShowdownPlayer } from '../showdownService.js';
import type { Card } from '../types.js';
import type { BadBeatState } from '../badBeatService.js';
import type { RakeConfig } from '../rake.js';

const NO_RAKE: RakeConfig = { percent: 0, capBb: 0 };
const NO_BB: BadBeatState | null = null;

function p(id: string, cards: Card[], committed: number, username = id): ShowdownPlayer {
  return { id, username, cards, totalCommitted: committed };
}

// Тузы против королей — туз выигрывает
const ACE_PAIR: Card[] = [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }];
const KING_PAIR: Card[] = [{ rank: 'K', suit: 'spades' }, { rank: 'K', suit: 'hearts' }];
const BOARD_NEUTRAL: Card[] = [
  { rank: '2', suit: 'clubs' },
  { rank: '7', suit: 'diamonds' },
  { rank: '9', suit: 'clubs' },
  { rank: '3', suit: 'hearts' },
  { rank: '5', suit: 'spades' },
];

describe('resolveShowdown', () => {
  it('один победитель забирает весь pot', () => {
    const alice = p('alice', ACE_PAIR, 100);
    const bob = p('bob', KING_PAIR, 100);
    const result = resolveShowdown(200, BOARD_NEUTRAL, 10, NO_RAKE, 'nlh', [alice, bob], [alice, bob], NO_BB);
    expect(result.winners).toEqual(['alice']);
    expect(result.amounts['alice']).toBe(200);
    expect(result.amounts['bob']).toBeUndefined();
    expect(result.rake).toBe(0);
    expect(result.badBeatDrop).toBe(0);
  });

  it('split pot при равных руках', () => {
    // Оба используют только борд (нет карт сильнее борда) — имитируем через одинаковые руки
    const BOARD_FLUSH: Card[] = [
      { rank: 'A', suit: 'clubs' },
      { rank: 'K', suit: 'clubs' },
      { rank: 'Q', suit: 'clubs' },
      { rank: 'J', suit: 'clubs' },
      { rank: '10', suit: 'clubs' },
    ];
    const LOW1: Card[] = [{ rank: '2', suit: 'hearts' }, { rank: '3', suit: 'hearts' }];
    const LOW2: Card[] = [{ rank: '4', suit: 'diamonds' }, { rank: '5', suit: 'diamonds' }];
    const alice = p('alice', LOW1, 100);
    const bob = p('bob', LOW2, 100);
    const result = resolveShowdown(200, BOARD_FLUSH, 10, NO_RAKE, 'nlh', [alice, bob], [alice, bob], NO_BB);
    expect(result.winners).toHaveLength(2);
    expect(result.amounts['alice']).toBe(100);
    expect(result.amounts['bob']).toBe(100);
  });

  it('side pot: all-in с разными стеками', () => {
    // alice all-in 50, bob 100, charlie 100 → main pot 150 (alice eligible), side pot 100 (bob+charlie)
    const alice = p('alice', ACE_PAIR, 50);
    const bob = p('bob', KING_PAIR, 100);
    // 4♦ 8♠ + борд 2,7,9,3,5 → нет пары, нет стрита → проигрывает AA и KK
    const WEAK: Card[] = [{ rank: '4', suit: 'diamonds' }, { rank: '8', suit: 'spades' }];
    const charlie = p('charlie', WEAK, 100);
    const result = resolveShowdown(250, BOARD_NEUTRAL, 10, NO_RAKE, 'nlh', [alice, bob, charlie], [alice, bob, charlie], NO_BB);
    // Alice выигрывает main pot (150), Bob выигрывает side pot (100)
    expect(result.winners).toContain('alice');
    expect(result.winners).toContain('bob');
    expect(result.amounts['alice']).toBe(150);
    expect(result.amounts['bob']).toBe(100);
  });

  it('рейк удерживается из банка', () => {
    const rake: RakeConfig = { percent: 5, capBb: 10 }; // 5% с кэпом 10BB
    const alice = p('alice', ACE_PAIR, 100);
    const bob = p('bob', KING_PAIR, 100);
    // pot=200, rake=5% из 200=10, cap=10BB×10=100 → rake=10
    const result = resolveShowdown(200, BOARD_NEUTRAL, 10, rake, 'nlh', [alice, bob], [alice, bob], NO_BB);
    expect(result.rake).toBe(10);
    expect(result.amounts['alice']).toBe(190); // 200 - 10 рейка
  });

  it('ни один активный игрок — winners=[]', () => {
    const result = resolveShowdown(200, BOARD_NEUTRAL, 10, NO_RAKE, 'nlh', [], [], NO_BB);
    expect(result.winners).toHaveLength(0);
    expect(result.amounts).toEqual({});
  });

  it('не мутирует players — chips у входных объектов не меняются', () => {
    const alice = p('alice', ACE_PAIR, 100);
    const bob = p('bob', KING_PAIR, 100);
    // ShowdownPlayer не имеет chips, но убеждаемся что totalCommitted не трогается
    const aliceCommitBefore = alice.totalCommitted;
    resolveShowdown(200, BOARD_NEUTRAL, 10, NO_RAKE, 'nlh', [alice, bob], [alice, bob], NO_BB);
    expect(alice.totalCommitted).toBe(aliceCommitBefore);
  });
});

import { describe, it, expect } from 'vitest';
import { winProbabilityVsRandom, computeRealEquity } from '../equity.js';
import { createDeck } from '../deck.js';
import type { Card } from '../types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

// Детерминированный RNG (mulberry32) — чтобы статистические проверки не флакали.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('winProbabilityVsRandom', () => {
  it('AA против 1 случайного оппонента префлоп ≈ 0.85', () => {
    const p = winProbabilityVsRandom([c('A', 'hearts'), c('A', 'spades')], [], 1, 4000, seeded(123));
    expect(p).toBeGreaterThan(0.80);
    expect(p).toBeLessThan(0.90);
  });

  it('готовый натс (роял-флеш на борде) = 1', () => {
    const board = [c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts'), c('2', 'clubs'), c('3', 'diamonds')];
    const p = winProbabilityVsRandom([c('A', 'hearts'), c('K', 'hearts')], board, 2, 500, seeded(7));
    expect(p).toBe(1);
  });

  it('равновесие падает с числом оппонентов', () => {
    const hole = [c('A', 'hearts'), c('A', 'spades')];
    const vs1 = winProbabilityVsRandom(hole, [], 1, 3000, seeded(42));
    const vs5 = winProbabilityVsRandom(hole, [], 5, 3000, seeded(42));
    expect(vs5).toBeLessThan(vs1);
  });

  it('нет оппонентов → 1; меньше 2 карманных → 0', () => {
    expect(winProbabilityVsRandom([c('A', 'hearts'), c('A', 'spades')], [], 0)).toBe(1);
    expect(winProbabilityVsRandom([c('A', 'hearts')], [], 1)).toBe(0);
  });
});

// EV Cashout (доделка §10.6) — equity между известными руками контестантов.
function remainingDeck(used: Card[]): Card[] {
  const key = (x: Card) => x.rank + x.suit;
  const usedKeys = new Set(used.map(key));
  return createDeck('nlh').filter((card) => !usedKeys.has(key(card)));
}

describe('computeRealEquity', () => {
  it('AA против KK префлоп (известные руки) ≈ 0.82/0.18', () => {
    const aHole = [c('A', 'hearts'), c('A', 'spades')];
    const bHole = [c('K', 'hearts'), c('K', 'spades')];
    const deck = remainingDeck([...aHole, ...bHole]);
    const result = computeRealEquity(
      [{ id: 'A', hole: aHole }, { id: 'B', hole: bHole }],
      [],
      deck,
      'nlh',
      4000,
      seeded(99),
    );
    expect(result.A).toBeGreaterThan(0.78);
    expect(result.A).toBeLessThan(0.86);
    expect(result.B).toBeCloseTo(1 - result.A, 5);
  });

  it('борд уже полный (5 карт) → детерминированный результат независимо от rng', () => {
    const aHole = [c('A', 'hearts'), c('A', 'spades')];
    const bHole = [c('K', 'hearts'), c('K', 'spades')];
    const board = [c('2', 'clubs'), c('3', 'diamonds'), c('4', 'clubs'), c('7', 'spades'), c('9', 'hearts')];
    const result = computeRealEquity([{ id: 'A', hole: aHole }, { id: 'B', hole: bHole }], board, [], 'nlh', 10);
    expect(result.A).toBe(1);
    expect(result.B).toBe(0);
  });

  it('один контестант → 100% без обращения к колоде/rng', () => {
    const result = computeRealEquity([{ id: 'A', hole: [c('A', 'hearts'), c('A', 'spades')] }], [], []);
    expect(result.A).toBe(1);
  });
});

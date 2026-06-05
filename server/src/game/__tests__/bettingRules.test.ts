import { describe, it, expect } from 'vitest';
import { minRaiseTo, isLegalRaise } from '../bettingRules.js';

// Чистые правила ставок (вынесены из handlePlayerAction, ROADMAP §9.3-B).
// Фиксируют ТЕКУЩЕЕ поведение min-raise + исключения all-in.

describe('minRaiseTo', () => {
  it('preflop: currentBet=BB → 2×BB', () => {
    // currentBet=20 (BB), bb=20 → max(40, 40) = 40
    expect(minRaiseTo(20, 20)).toBe(40);
  });

  it('после рейза: currentBet=50, bb=20 → max(100, 70) = 100', () => {
    expect(minRaiseTo(50, 20)).toBe(100);
  });

  it('малый currentBet относительно BB: currentBet=5, bb=20 → max(10, 25) = 25', () => {
    expect(minRaiseTo(5, 20)).toBe(25);
  });
});

describe('isLegalRaise', () => {
  const bb = 20;

  it('undefined amount → нелегально', () => {
    expect(isLegalRaise(undefined, 20, bb, 1000, 0)).toBe(false);
  });

  it('amount <= currentBet → нелегально', () => {
    expect(isLegalRaise(20, 20, bb, 1000, 0)).toBe(false);
    expect(isLegalRaise(10, 20, bb, 1000, 0)).toBe(false);
  });

  it('amount >= min-raise → легально', () => {
    // min-raise to = 40
    expect(isLegalRaise(40, 20, bb, 1000, 0)).toBe(true);
    expect(isLegalRaise(60, 20, bb, 1000, 0)).toBe(true);
  });

  it('amount между currentBet и min-raise, НЕ all-in → нелегально', () => {
    // 30 < min-raise(40), стек большой → не all-in
    expect(isLegalRaise(30, 20, bb, 1000, 0)).toBe(false);
  });

  it('all-in остатком меньше min-raise → легально (исключение коротких стеков)', () => {
    // currentBet=20, игрок all-in to 30: 30 > currentBet, но 30 < min-raise(40);
    // chips=30, currentBet=0 → 30 >= 30 = all-in → легально.
    expect(isLegalRaise(30, 20, bb, 30, 0)).toBe(true);
  });

  it('all-in ровно на стек, превышающий min-raise → легально', () => {
    // chips=200, currentBet=0, amount=200 = all-in и >= min-raise
    expect(isLegalRaise(200, 20, bb, 200, 0)).toBe(true);
  });

  it('учитывает уже вложенный playerCurrentBet в порог all-in', () => {
    // chips=10, уже вложено currentBet=30 → max bet = 40. amount=40 = all-in (>= chips+currentBet)
    expect(isLegalRaise(40, 35, bb, 10, 30)).toBe(true);
  });
});

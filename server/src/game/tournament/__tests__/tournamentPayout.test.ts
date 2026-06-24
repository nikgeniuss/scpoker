import { describe, it, expect } from 'vitest';
import { getSngPayoutTiers, computeSngPayout, getMttPayoutTiers, computeMttPayout } from '../tournamentPayout.js';

describe('tournamentPayout — SNG-выплаты', () => {
  it('heads-up (2): победителю 100%', () => {
    expect(getSngPayoutTiers(2)).toEqual([{ place: 1, percent: 100 }]);
  });

  it('4-max: top-2 65/35', () => {
    expect(getSngPayoutTiers(4)).toEqual([{ place: 1, percent: 65 }, { place: 2, percent: 35 }]);
  });

  it('9-max: top-3 50/30/20', () => {
    expect(getSngPayoutTiers(9)).toEqual([
      { place: 1, percent: 50 },
      { place: 2, percent: 30 },
      { place: 3, percent: 20 },
    ]);
  });

  it('computeSngPayout: суммарно выплаченное == prizePool (без потерь на округлении)', () => {
    const payout = computeSngPayout(1000, 9);
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
    expect(payout[1]).toBe(500);
    expect(payout[2]).toBe(300);
    expect(payout[3]).toBe(200);
  });

  it('computeSngPayout: округление с остатком уходит победителю', () => {
    const payout = computeSngPayout(1001, 9); // 500.5/300.3/200.2 → floor 500/300/200, остаток 1
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(1001);
    expect(payout[1]).toBe(501);
  });

  it('computeSngPayout heads-up: всё победителю', () => {
    expect(computeSngPayout(2000, 2)).toEqual({ 1: 2000 });
  });
});

describe('tournamentPayout — MTT-выплаты (ITM-кривая)', () => {
  it('getMttPayoutTiers: 18 участников, ITM 20% → 4 призовых места, убывающая кривая 48/24/16/12', () => {
    const tiers = getMttPayoutTiers(18, 20);
    expect(tiers.map(t => t.place)).toEqual([1, 2, 3, 4]);
    expect(tiers.map(t => Math.round(t.percent * 100) / 100)).toEqual([48, 24, 16, 12]);
    const sum = tiers.reduce((a, t) => a + t.percent, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('getMttPayoutTiers: минимум 1 призовое место даже при маленьком поле', () => {
    expect(getMttPayoutTiers(5, 10)).toEqual([{ place: 1, percent: 100 }]);
  });

  it('computeMttPayout: суммарно выплаченное == prizePool, без потерь на округлении', () => {
    const payout = computeMttPayout(10_000, 18, 20);
    expect(payout).toEqual({ 1: 4800, 2: 2400, 3: 1600, 4: 1200 });
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000);
  });

  it('computeMttPayout: округление с остатком уходит победителю', () => {
    const payout = computeMttPayout(10_001, 18, 20);
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(10_001);
    expect(payout[1]).toBe(4801);
  });
});

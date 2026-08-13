import { describe, it, expect } from 'vitest';
import {
  getSngPayoutTiers, computeSngPayout, getMttPayoutTiers, computeMttPayout, computeGuaranteeOverlay,
  computeBountySplit,
} from '../tournamentPayout.js';

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

describe('tournamentPayout — MTT-выплаты (настраиваемая форма кривой, exponent)', () => {
  it('exponent=1 (дефолт) — та же гармоническая кривая, что и без параметра', () => {
    expect(getMttPayoutTiers(18, 20, undefined, 1)).toEqual(getMttPayoutTiers(18, 20));
  });

  it('exponent>1 — top-heavy, 1-е место получает больше, чем на гармонической кривой', () => {
    const harmonic = getMttPayoutTiers(18, 20)[0].percent;
    const topHeavy = getMttPayoutTiers(18, 20, undefined, 2)[0].percent;
    expect(topHeavy).toBeGreaterThan(harmonic);
  });

  it('exponent<1 — flat, 1-е место получает меньше, чем на гармонической кривой', () => {
    const harmonic = getMttPayoutTiers(18, 20)[0].percent;
    const flat = getMttPayoutTiers(18, 20, undefined, 0.5)[0].percent;
    expect(flat).toBeLessThan(harmonic);
  });

  it('сумма % всегда 100 независимо от exponent', () => {
    for (const exponent of [0.3, 0.7, 1, 1.4, 2.5]) {
      const tiers = getMttPayoutTiers(18, 20, undefined, exponent);
      const sum = tiers.reduce((a, t) => a + t.percent, 0);
      expect(sum).toBeCloseTo(100, 5);
    }
  });

  it('computeMttPayout: exponent пробрасывается, суммарно выплаченное == prizePool', () => {
    const payout = computeMttPayout(10_000, 18, 20, undefined, 2);
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000);
  });
});

describe('tournamentPayout — MTT-выплаты (фиксированное число мест, независимо от участников)', () => {
  it('getMttPayoutTiers: fixedPlaces игнорирует itmPercent и держит ровно N мест', () => {
    // 100 участников, ITM 10% дал бы 10 мест, но fixedPlaces=3 — строго 3 места.
    const tiers = getMttPayoutTiers(100, 10, 3);
    expect(tiers.map(t => t.place)).toEqual([1, 2, 3]);
  });

  it('getMttPayoutTiers: то же число мест при 30 и при 300 участниках (не зависит от участников)', () => {
    const small = getMttPayoutTiers(30, 10, 9);
    const big = getMttPayoutTiers(300, 10, 9);
    expect(small.map(t => t.place)).toEqual(big.map(t => t.place));
    expect(small.map(t => t.percent)).toEqual(big.map(t => t.percent));
  });

  it('getMttPayoutTiers: fixedPlaces > число участников — capped числом участников', () => {
    const tiers = getMttPayoutTiers(5, 10, 9);
    expect(tiers).toHaveLength(5);
  });

  it('getMttPayoutTiers: fixedPlaces=0 или не задан — fallback на ITM%-логику', () => {
    expect(getMttPayoutTiers(18, 20, 0)).toEqual(getMttPayoutTiers(18, 20));
    expect(getMttPayoutTiers(18, 20, undefined)).toEqual(getMttPayoutTiers(18, 20));
  });

  it('computeMttPayout: 3 фиксированных места, суммарно выплаченное == prizePool', () => {
    const payout = computeMttPayout(10_000, 100, 10, 3);
    expect(Object.keys(payout)).toHaveLength(3);
    const total = Object.values(payout).reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000);
  });
});

describe('tournamentPayout — гарантированный приз (overlay)', () => {
  it('бай-инов меньше гарантии — рум доплачивает разницу', () => {
    expect(computeGuaranteeOverlay(6000, 10000)).toBe(4000);
  });

  it('бай-инов хватает или больше гарантии — оверлей не нужен', () => {
    expect(computeGuaranteeOverlay(10000, 10000)).toBe(0);
    expect(computeGuaranteeOverlay(15000, 10000)).toBe(0);
  });

  it('гарантия не задана — оверлей 0', () => {
    expect(computeGuaranteeOverlay(6000, undefined)).toBe(0);
    expect(computeGuaranteeOverlay(6000, 0)).toBe(0);
  });
});

describe('tournamentPayout — баунти/PKO (computeBountySplit)', () => {
  it('flat: весь баунти кэшем убийце, ничего не растёт', () => {
    expect(computeBountySplit('flat', 500)).toEqual({ cash: 500, addToOwnBounty: 0 });
  });

  it('progressive: половина кэшем, половина в собственный баунти убийцы', () => {
    expect(computeBountySplit('progressive', 500)).toEqual({ cash: 250, addToOwnBounty: 250 });
  });

  it('progressive: нечётная сумма — округление вниз в addToOwnBounty, остаток в кэш (без потерь)', () => {
    const { cash, addToOwnBounty } = computeBountySplit('progressive', 501);
    expect(cash + addToOwnBounty).toBe(501);
    expect(addToOwnBounty).toBe(250);
    expect(cash).toBe(251);
  });
});

import { describe, it, expect } from 'vitest';
import { computeRake, validateRakeConfig, normalizeRake } from '../rake.js';

describe('computeRake', () => {
  const cfg = { percent: 5, capBb: 3 };

  it('no flop, no drop: без флопа рейк = 0', () => {
    expect(computeRake(1000, 10, cfg, false)).toBe(0);
  });

  it('процент от банка (под cap)', () => {
    // 5% от 400 = 20; cap = 3*10 = 30 → 20
    expect(computeRake(400, 10, cfg, true)).toBe(20);
  });

  it('cap ограничивает крупный банк', () => {
    // 5% от 2000 = 100; cap = 3*10 = 30 → 30
    expect(computeRake(2000, 10, cfg, true)).toBe(30);
  });

  it('percent = 0 → рейк выключен', () => {
    expect(computeRake(2000, 10, { percent: 0, capBb: 3 }, true)).toBe(0);
  });

  it('floor округление процента', () => {
    // 5% от 450 = 22.5 → 22
    expect(computeRake(450, 10, cfg, true)).toBe(22);
  });

  it('пустой банк → 0', () => {
    expect(computeRake(0, 10, cfg, true)).toBe(0);
  });
});

describe('validateRakeConfig', () => {
  it('валидный конфиг', () => {
    expect(validateRakeConfig({ percent: 5, capBb: 3 })).toBeNull();
  });
  it('percent вне диапазона', () => {
    expect(validateRakeConfig({ percent: 150, capBb: 3 })).toMatch(/percent/);
    expect(validateRakeConfig({ percent: -1, capBb: 3 })).toMatch(/percent/);
  });
  it('capBb вне диапазона', () => {
    expect(validateRakeConfig({ percent: 5, capBb: -2 })).toMatch(/capBb/);
  });
});

describe('normalizeRake', () => {
  it('undefined → выключен', () => {
    expect(normalizeRake(undefined)).toEqual({ percent: 0, capBb: 0 });
  });
  it('зажимает и округляет', () => {
    expect(normalizeRake({ percent: 200, capBb: 2.7 })).toEqual({ percent: 100, capBb: 3 });
    expect(normalizeRake({ percent: 2.55, capBb: 5 })).toEqual({ percent: 2.6, capBb: 5 });
  });
});

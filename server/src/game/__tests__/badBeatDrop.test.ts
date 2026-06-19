import { describe, it, expect } from 'vitest';
import { computeBadBeatDrop, selectTier, tierUpperBbCents } from '../badBeatDrop.js';
import type { BadBeatState, BadBeatTier } from '../badBeatService.js';

const TIERS: BadBeatTier[] = [
  { blinds: '0.01/0.02 ~ 0.05/0.10', bb: 0.6, win: 8.25, opp: 3.75, oth: 3.0 },
  { blinds: '0.10/0.20 ~ 0.30/0.60', bb: 0.4, win: 13.75, opp: 6.25, oth: 5.0 },
  { blinds: '0.50/1 ~ 2.50/5', bb: 0.25, win: 19.25, opp: 8.75, oth: 7.0 },
  { blinds: '25/50 ~ Higher', bb: 0.03, win: 44.0, opp: 20.0, oth: 16.0 },
];

const state = (over: Partial<BadBeatState> = {}): BadBeatState => ({
  enabled: true,
  pool: 0,
  dropMode: 'bb',
  percent: 0.15,
  triggers: {},
  tiers: TIERS,
  topups: [],
  ...over,
});

describe('tierUpperBbCents', () => {
  it('парсит верхнюю границу ББ из метки (доллары → центы)', () => {
    expect(tierUpperBbCents('0.01/0.02 ~ 0.05/0.10')).toBe(10);
    expect(tierUpperBbCents('0.50/1 ~ 2.50/5')).toBe(500);
  });
  it('«Higher» → Infinity', () => {
    expect(tierUpperBbCents('25/50 ~ Higher')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('selectTier', () => {
  it('первый тир, в чей диапазон попадает bigBlind (центы)', () => {
    expect(selectTier(TIERS, 2)?.bb).toBe(0.6); // $0.02 → тир 1
    expect(selectTier(TIERS, 200)?.bb).toBe(0.25); // $2.00 → тир 3
  });
  it('сверхвысокие блайнды → последний тир (Higher)', () => {
    expect(selectTier(TIERS, 100000)?.bb).toBe(0.03);
  });
});

describe('computeBadBeatDrop', () => {
  it('выключенный джекпот → 0', () => {
    expect(computeBadBeatDrop(state({ enabled: false }), 10000, 2)).toBe(0);
  });
  it('пустой/нулевой банк → 0', () => {
    expect(computeBadBeatDrop(state(), 0, 2)).toBe(0);
  });
  it('режим bb: tier.bb × bigBlind', () => {
    // bigBlind=200 (центы) → тир 3 (bb=0.25) → 0.25*200 = 50
    expect(computeBadBeatDrop(state({ dropMode: 'bb' }), 100000, 200)).toBe(50);
  });
  it('режим percent: % от пост-рейкового остатка', () => {
    // 0.15% от 9800 = 14.7 → floor 14
    expect(computeBadBeatDrop(state({ dropMode: 'percent', percent: 0.15 }), 9800, 200)).toBe(14);
  });
  it('зажимается сверху размером банка', () => {
    // bb=0.6, bigBlind=10000 → 6000, но банк всего 100 → 100
    expect(computeBadBeatDrop(state({ dropMode: 'bb' }), 100, 10000)).toBe(100);
  });
});

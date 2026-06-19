import { describe, it, expect } from 'vitest';
import { computeRabbitHuntEligibility, canPayRabbitHunt } from '../rabbitHuntService.js';
import type { Card } from '../types.js';

const deck: Card[] = Array.from({ length: 10 }, () => ({ rank: '2', suit: 'spades' }) as Card);

describe('computeRabbitHuntEligibility', () => {
  it('фича выключена → null', () => {
    expect(computeRabbitHuntEligibility({ enabled: false, mode: 'fixed', fixedAmount: 50, percent: 5 }, 150, 0, deck)).toBeNull();
  });

  it('борд уже полный (5 карт) → null', () => {
    expect(computeRabbitHuntEligibility({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 }, 150, 5, deck)).toBeNull();
  });

  it('mode=fixed → цена = fixedAmount', () => {
    const r = computeRabbitHuntEligibility({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 }, 150, 0, deck);
    expect(r?.price).toBe(50);
  });

  it('mode=percent → цена = floor(pot * percent / 100)', () => {
    const r = computeRabbitHuntEligibility({ enabled: true, mode: 'percent', fixedAmount: 0, percent: 10 }, 150, 0, deck);
    expect(r?.price).toBe(15);
  });

  it('mode=percent, цена выходит < 1 → минимум 1', () => {
    const r = computeRabbitHuntEligibility({ enabled: true, mode: 'percent', fixedAmount: 0, percent: 1 }, 10, 0, deck);
    expect(r?.price).toBe(1);
  });

  it('цена 0 (fixed=0) → null', () => {
    expect(computeRabbitHuntEligibility({ enabled: true, mode: 'fixed', fixedAmount: 0, percent: 5 }, 150, 0, deck)).toBeNull();
  });

  it('возвращает карты будущего борда нужной длины (префлоп → 5)', () => {
    const r = computeRabbitHuntEligibility({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 }, 150, 0, deck);
    expect(r?.cards).toHaveLength(5);
  });
});

describe('canPayRabbitHunt', () => {
  it('фаза не showdown → false', () => {
    expect(canPayRabbitHunt('flop', 50, [], false, 1000)).toBe(false);
  });

  it('cards отсутствуют → false', () => {
    expect(canPayRabbitHunt('showdown', 50, undefined, false, 1000)).toBe(false);
  });

  it('price === undefined → false', () => {
    expect(canPayRabbitHunt('showdown', undefined, [], false, 1000)).toBe(false);
  });

  it('уже оплатил → false', () => {
    expect(canPayRabbitHunt('showdown', 50, [], true, 1000)).toBe(false);
  });

  it('не хватает стека → false', () => {
    expect(canPayRabbitHunt('showdown', 2000, [], false, 1000)).toBe(false);
  });

  it('все условия выполнены → true', () => {
    expect(canPayRabbitHunt('showdown', 50, [], false, 1000)).toBe(true);
  });
});

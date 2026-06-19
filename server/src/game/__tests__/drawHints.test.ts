import { describe, it, expect } from 'vitest';
import { detectDraws, drawLabel } from '../drawHints.js';
import type { Card } from '../types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('detectDraws', () => {
  it('флеш-дро: 4 червы на флопе', () => {
    const d = detectDraws([c('A', 'hearts'), c('K', 'hearts')], [c('5', 'hearts'), c('9', 'hearts'), c('2', 'clubs')]);
    expect(d.flushDraw).toBe(true);
  });

  it('собранный флеш — НЕ дро (5 одной масти)', () => {
    const d = detectDraws([c('A', 'hearts'), c('K', 'hearts')], [c('5', 'hearts'), c('9', 'hearts'), c('2', 'hearts')]);
    expect(d.flushDraw).toBe(false);
  });

  it('OESD: 4 подряд (открытый стрит-дро)', () => {
    const d = detectDraws([c('7', 'hearts'), c('8', 'spades')], [c('9', 'clubs'), c('10', 'diamonds'), c('2', 'hearts')]);
    expect(d.straightDraw).toBe(true);
  });

  it('гатшот: дырка в стрите тоже стрит-дро', () => {
    const d = detectDraws([c('7', 'hearts'), c('8', 'spades')], [c('9', 'clubs'), c('J', 'diamonds'), c('2', 'hearts')]);
    expect(d.straightDraw).toBe(true);
  });

  it('колесо: A-2-3-4 → стрит-дро (туз снизу)', () => {
    const d = detectDraws([c('A', 'hearts'), c('2', 'spades')], [c('3', 'clubs'), c('4', 'diamonds'), c('9', 'hearts')]);
    expect(d.straightDraw).toBe(true);
  });

  it('собранный стрит — НЕ стрит-дро', () => {
    const d = detectDraws([c('7', 'hearts'), c('8', 'spades')], [c('9', 'clubs'), c('10', 'diamonds'), c('J', 'hearts')]);
    expect(d.straightDraw).toBe(false);
  });

  it('нет дро на сухом борде', () => {
    const d = detectDraws([c('A', 'hearts'), c('K', 'spades')], [c('2', 'clubs'), c('7', 'diamonds'), c('9', 'hearts')]);
    expect(d.flushDraw).toBe(false);
    expect(d.straightDraw).toBe(false);
  });
});

describe('drawLabel', () => {
  it('оба дро → комбинированная метка', () => {
    expect(drawLabel({ flushDraw: true, straightDraw: true })).toBe('Стрит- и флеш-дро');
  });
  it('только флеш / только стрит / ничего', () => {
    expect(drawLabel({ flushDraw: true, straightDraw: false })).toBe('Флеш-дро');
    expect(drawLabel({ flushDraw: false, straightDraw: true })).toBe('Стрит-дро');
    expect(drawLabel({ flushDraw: false, straightDraw: false })).toBeUndefined();
  });
});

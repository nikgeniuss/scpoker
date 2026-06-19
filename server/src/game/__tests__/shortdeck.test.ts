import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck.js';
import { evaluateHand, compareHands, formatHandName } from '../hands.js';
import { detectDraws } from '../drawHints.js';
import { handHintName } from '../handHint.js';
import type { Card } from '../types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('Шорт-дэк: колода', () => {
  it('createDeck(shortdeck) → 36 карт без 2–5', () => {
    const deck = createDeck('shortdeck');
    expect(deck).toHaveLength(36);
    expect(deck.some((x) => ['2', '3', '4', '5'].includes(x.rank))).toBe(false);
  });
  it('createDeck(nlh) → 52 карты (дефолт не сломан)', () => {
    expect(createDeck('nlh')).toHaveLength(52);
    expect(createDeck()).toHaveLength(52);
  });
});

describe('Шорт-дэк: ранжир (Triton)', () => {
  const flushBoard = [c('Q', 'hearts'), c('9', 'hearts'), c('7', 'hearts'), c('8', 'clubs'), c('6', 'diamonds')];
  const fullBoard = [c('A', 'spades'), c('K', 'clubs'), c('K', 'diamonds'), c('8', 'clubs'), c('6', 'diamonds')];
  const flushHole = [c('A', 'hearts'), c('K', 'hearts')];
  const fullHole = [c('A', 'clubs'), c('A', 'diamonds')];

  it('флеш бьёт фулл-хаус', () => {
    const flush = evaluateHand(flushHole, flushBoard, 'shortdeck');
    const full = evaluateHand(fullHole, fullBoard, 'shortdeck');
    expect(flush.rank).toBe('flush');
    expect(full.rank).toBe('full-house');
    expect(compareHands(flush, full)).toBeGreaterThan(0); // флеш выше
  });

  it('в NLH тот же расклад: фулл бьёт флеш (контраст)', () => {
    const flush = evaluateHand(flushHole, flushBoard, 'nlh');
    const full = evaluateHand(fullHole, fullBoard, 'nlh');
    expect(flush.rank).toBe('flush');
    expect(full.rank).toBe('full-house');
    expect(compareHands(flush, full)).toBeLessThan(0); // фулл выше
  });

  it('младший стрит A-6-7-8-9 (туз снизу), старшая карта 9', () => {
    const r = evaluateHand([c('A', 'hearts'), c('6', 'clubs')], [c('7', 'diamonds'), c('8', 'spades'), c('9', 'hearts')], 'shortdeck');
    expect(r.rank).toBe('straight');
    expect(formatHandName(r)).toBe('Стрит до 9');
  });

  it('в NLH A-6-7-8-9 — НЕ стрит (нужны 2–5 для колеса)', () => {
    const r = evaluateHand([c('A', 'hearts'), c('6', 'clubs')], [c('7', 'diamonds'), c('8', 'spades'), c('9', 'hearts')], 'nlh');
    expect(r.rank).toBe('high-card');
  });

  it('6-7-8-9-10 бьёт младший стрит A-6-7-8-9', () => {
    const board = [c('7', 'diamonds'), c('8', 'spades'), c('9', 'hearts')];
    const low = evaluateHand([c('A', 'hearts'), c('6', 'clubs')], board, 'shortdeck');
    const high = evaluateHand([c('10', 'clubs'), c('6', 'hearts')], board, 'shortdeck');
    expect(high.rank).toBe('straight');
    expect(compareHands(high, low)).toBeGreaterThan(0);
  });

  it('роял-флеш в короткой колоде работает', () => {
    const r = evaluateHand([c('A', 'hearts'), c('K', 'hearts')], [c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts')], 'shortdeck');
    expect(r.rank).toBe('royal-flush');
  });
});

describe('Шорт-дэк: дро и подсказка', () => {
  it('A-6-7-8 → стрит-дро (туз снизу как 5)', () => {
    const d = detectDraws([c('A', 'hearts'), c('6', 'clubs')], [c('7', 'diamonds'), c('8', 'spades'), c('K', 'hearts')], 'shortdeck');
    expect(d.straightDraw).toBe(true);
  });
  it('в NLH тот же набор A-6-7-8 — не стрит-дро', () => {
    const d = detectDraws([c('A', 'hearts'), c('6', 'clubs')], [c('7', 'diamonds'), c('8', 'spades'), c('K', 'hearts')], 'nlh');
    expect(d.straightDraw).toBe(false);
  });
  it('handHintName показывает младший стрит', () => {
    expect(
      handHintName([c('A', 'hearts'), c('6', 'clubs')], [c('7', 'diamonds'), c('8', 'spades'), c('9', 'hearts')], 'shortdeck'),
    ).toBe('Стрит до 9');
  });
});

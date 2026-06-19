import { describe, it, expect } from 'vitest';
import { handHintName } from '../handHint.js';
import type { Card } from '../types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('handHintName', () => {
  it('пара тузов на префлопе (только карманные)', () => {
    expect(handHintName([c('A', 'hearts'), c('A', 'spades')], [])).toBe('Пара тузов');
  });

  it('старшая карта когда пары нет', () => {
    expect(handHintName([c('A', 'hearts'), c('K', 'spades')], [])).toBe('Старшая карта: туза');
  });

  it('роял-флеш на полном борде', () => {
    const board = [c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts'), c('2', 'clubs'), c('3', 'diamonds')];
    expect(handHintName([c('A', 'hearts'), c('K', 'hearts')], board)).toBe('Роял-флеш');
  });

  it('сет на флопе', () => {
    const board = [c('A', 'hearts'), c('A', 'clubs'), c('7', 'diamonds')];
    expect(handHintName([c('A', 'spades'), c('K', 'hearts')], board)).toBe('Сет тузов');
  });

  it('менее 2 карманных → undefined', () => {
    expect(handHintName([c('A', 'hearts')], [])).toBeUndefined();
    expect(handHintName([], [])).toBeUndefined();
  });

  it('на флопе дописывает флеш-дро к слабой комбинации', () => {
    const board = [c('5', 'hearts'), c('9', 'hearts'), c('2', 'clubs')];
    expect(handHintName([c('A', 'hearts'), c('K', 'hearts')], board)).toBe('Старшая карта: туза · Флеш-дро');
  });

  it('собранный флеш не превращается в дро', () => {
    const board = [c('5', 'hearts'), c('9', 'hearts'), c('2', 'hearts')];
    expect(handHintName([c('A', 'hearts'), c('K', 'hearts')], board)).toBe('Флеш до туза');
  });

  it('OESD на флопе дописывается стрит-дро', () => {
    const board = [c('9', 'clubs'), c('10', 'diamonds'), c('2', 'hearts')];
    expect(handHintName([c('7', 'hearts'), c('8', 'spades')], board)).toBe('Старшая карта: 10 · Стрит-дро');
  });

  it('на ривере дро не дописывается', () => {
    const board = [c('5', 'hearts'), c('9', 'hearts'), c('2', 'clubs'), c('K', 'spades'), c('3', 'diamonds')];
    // 4 червы, но борд полный — добора нет, метку не клеим.
    expect(handHintName([c('A', 'hearts'), c('Q', 'hearts')], board)).toBe('Старшая карта: туза');
  });
});

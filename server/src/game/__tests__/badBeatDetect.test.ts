import { describe, it, expect } from 'vitest';
import { detectBadBeat, computeBadBeatPayout, type Contender } from '../badBeatDetect.js';
import type { Card, Rank, Suit } from '../types.js';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

// Сценарий бэд-бита: проигравший — каре девяток (карманная пара 9♣9♦), теряет против
// стрит-флеша 6♠7♠8♠9♠10♠ (карманные 10♠6♠). Борд: 9♠ 9♥ 7♠ 8♠ 2♦.
const community: Card[] = [c('9', 'spades'), c('9', 'hearts'), c('7', 'spades'), c('8', 'spades'), c('2', 'diamonds')];
const LOSER: Contender = { id: 'loser', hole: [c('9', 'clubs'), c('9', 'diamonds')] };
const WINNER: Contender = { id: 'winner', hole: [c('10', 'spades'), c('6', 'spades')] };
const FILLER1: Contender = { id: 'f1', hole: [c('K', 'clubs'), c('Q', 'hearts')] };
const FILLER2: Contender = { id: 'f2', hole: [c('3', 'clubs'), c('4', 'hearts')] };

describe('detectBadBeat', () => {
  it('срабатывает: каре с карманной парой проигрывает стрит-флешу', () => {
    const res = detectBadBeat({
      contenders: [LOSER, WINNER, FILLER1, FILLER2],
      community,
      winnerIds: ['winner'],
      presetId: 'aaajj',
      dealtCount: 4,
    });
    expect(res).toEqual({ loserId: 'loser', opponentId: 'winner' });
  });

  it('не срабатывает при <4 игроках на префлопе', () => {
    const res = detectBadBeat({
      contenders: [LOSER, WINNER],
      community,
      winnerIds: ['winner'],
      presetId: 'aaajj',
      dealtCount: 2,
    });
    expect(res).toBeNull();
  });

  it('каре без карманной пары не квалифицируется', () => {
    // Борд с тремя девятками; проигравший делает каре одной карманной (9♣) + A — не пара.
    const board: Card[] = [c('9', 'spades'), c('9', 'hearts'), c('9', 'diamonds'), c('K', 'clubs'), c('2', 'spades')];
    const loserNoPair: Contender = { id: 'loser', hole: [c('9', 'clubs'), c('A', 'diamonds')] };
    const winnerRoyal: Contender = { id: 'winner', hole: [c('A', 'spades'), c('Q', 'spades')] }; // не флеш тут
    const res = detectBadBeat({
      contenders: [loserNoPair, winnerRoyal],
      community: board,
      winnerIds: ['winner'],
      presetId: 'aaajj',
      dealtCount: 4,
    });
    expect(res).toBeNull();
  });

  it('не срабатывает, если ничья ниже порога (нет монстра)', () => {
    const board: Card[] = [c('2', 'spades'), c('5', 'hearts'), c('9', 'diamonds'), c('K', 'clubs'), c('3', 'spades')];
    const res = detectBadBeat({
      contenders: [
        { id: 'loser', hole: [c('A', 'clubs'), c('A', 'diamonds')] }, // пара тузов — ниже порога
        { id: 'winner', hole: [c('K', 'hearts'), c('Q', 'spades')] },
      ],
      community: board,
      winnerIds: ['winner'],
      presetId: 'aaajj',
      dealtCount: 4,
    });
    expect(res).toBeNull();
  });
});

describe('computeBadBeatPayout', () => {
  const tier = { blinds: '', bb: 0, win: 8.25, opp: 3.75, oth: 3.0 };

  it('Вариант А: % от пула, остаток переносится', () => {
    const { payouts, total } = computeBadBeatPayout({
      pool: 1_000_000, // центы ($10 000)
      tier,
      loserId: 'L',
      opponentId: 'O',
      otherIds: ['x', 'y'],
    });
    // 8.25% → 82500; 3.75% → 37500; 3% → 30000 каждому (×2)
    expect(payouts).toEqual([
      { id: 'L', amount: 82500 },
      { id: 'O', amount: 37500 },
      { id: 'x', amount: 30000 },
      { id: 'y', amount: 30000 },
    ]);
    expect(total).toBe(180000);
    expect(total).toBeLessThan(1_000_000); // остаток в пуле
  });

  it('масштабирует вниз, если доли превышают пул', () => {
    const big = { blinds: '', bb: 0, win: 44, opp: 20, oth: 16 };
    const { total } = computeBadBeatPayout({
      pool: 1000,
      tier: big,
      loserId: 'L',
      opponentId: 'O',
      otherIds: ['a', 'b', 'c', 'd', 'e', 'f'], // 44+20+16*6 = 160% > пула
    });
    expect(total).toBeLessThanOrEqual(1000);
  });

  it('пустой пул → нет выплат', () => {
    const { payouts, total } = computeBadBeatPayout({ pool: 0, tier, loserId: 'L', opponentId: 'O', otherIds: [] });
    expect(payouts).toEqual([]);
    expect(total).toBe(0);
  });
});

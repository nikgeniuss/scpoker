import { describe, it, expect, vi } from 'vitest';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  dealCommunityCards,
  getFutureBoardCards,
} from '../deck.js';
import { card } from './helpers/cards.js';

// Проверяет deck.ts против POKER_RULES.md §1 (колода 52 карты, Fisher-Yates),
// §2.3 (раздача hole-карт), §3.1 (burn-карты перед flop/turn/river).

describe('createDeck', () => {
  it('возвращает ровно 52 карты', () => {
    expect(createDeck()).toHaveLength(52);
  });

  it('все 52 уникальны (4 масти × 13 рангов)', () => {
    const d = createDeck();
    const keys = new Set(d.map((c) => c.rank + '|' + c.suit));
    expect(keys.size).toBe(52);
  });

  it('содержит ровно по 13 карт каждой масти', () => {
    const d = createDeck();
    for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
      const count = d.filter((c) => c.suit === suit).length;
      expect(count).toBe(13);
    }
  });

  it('содержит ровно по 4 карты каждого ранга', () => {
    const d = createDeck();
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const) {
      const count = d.filter((c) => c.rank === rank).length;
      expect(count).toBe(4);
    }
  });
});

describe('shuffleDeck', () => {
  it('возвращает 52 карты', () => {
    expect(shuffleDeck(createDeck())).toHaveLength(52);
  });

  it('сохраняет multiset карт (тот же набор, иной порядок)', () => {
    const orig = createDeck();
    const shuf = shuffleDeck(orig);
    const sortKey = (c: { rank: string; suit: string }) => c.suit + '|' + c.rank;
    const sortedOrig = [...orig].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const sortedShuf = [...shuf].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    expect(sortedShuf).toEqual(sortedOrig);
  });

  it('не мутирует входной массив', () => {
    const orig = createDeck();
    const snapshot = [...orig];
    shuffleDeck(orig);
    expect(orig).toEqual(snapshot);
  });

  it('с seeded Math.random — детерминирован', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = shuffleDeck(createDeck());
    const b = shuffleDeck(createDeck());
    expect(a).toEqual(b);
    spy.mockRestore();
  });
});

describe('dealCards — раздача hole-карт', () => {
  it('N=2: hands имеет 2 руки по 2 карты', () => {
    const deck = createDeck();
    const { hands, remainingDeck } = dealCards(deck, 2);
    expect(hands).toHaveLength(2);
    expect(hands[0]).toHaveLength(2);
    expect(hands[1]).toHaveLength(2);
    expect(remainingDeck).toHaveLength(48);
  });

  it('Player 0 первой картой получает array[length-1] (pop с конца)', () => {
    const deck = [
      card('2', 'c'), card('3', 'c'), card('4', 'c'), card('5', 'c'),
      card('A', 'h'), card('K', 'h'), card('A', 's'), card('K', 's'),
    ];
    const { hands } = dealCards(deck, 2);
    // pop(): сначала K♠ (последний), потом A♠, потом K♥, потом A♥
    expect(hands[0][0]).toEqual({ rank: 'K', suit: 'spades' });
    expect(hands[0][1]).toEqual({ rank: 'A', suit: 'spades' });
    expect(hands[1][0]).toEqual({ rank: 'K', suit: 'hearts' });
    expect(hands[1][1]).toEqual({ rank: 'A', suit: 'hearts' });
  });

  it('не мутирует входной массив', () => {
    const deck = createDeck();
    const snapshot = [...deck];
    dealCards(deck, 4);
    expect(deck).toEqual(snapshot);
  });

  it('N=9: 18 карт раздаётся, 34 остаётся', () => {
    const { hands, remainingDeck } = dealCards(createDeck(), 9);
    expect(hands).toHaveLength(9);
    hands.forEach((h) => expect(h).toHaveLength(2));
    expect(remainingDeck).toHaveLength(52 - 18);
  });
});

describe('dealCommunityCards — burn + community', () => {
  it('flop (count=3): сжигает 1, раздаёт 3, потребляет 4 карты', () => {
    const deck = createDeck();
    const { cards: c, remainingDeck } = dealCommunityCards(deck, 3);
    expect(c).toHaveLength(3);
    expect(remainingDeck).toHaveLength(deck.length - 4);
  });

  it('turn/river (count=1): сжигает 1, раздаёт 1, потребляет 2 карты', () => {
    const deck = createDeck();
    const { cards: c, remainingDeck } = dealCommunityCards(deck, 1);
    expect(c).toHaveLength(1);
    expect(remainingDeck).toHaveLength(deck.length - 2);
  });

  it('burn действительно отбрасывается (раздаются НЕ первые N с верха)', () => {
    // Сконструируем колоду так чтобы burn был отличим
    const top = [
      card('2', 'c'), // дно (consumed last)
      card('3', 'c'),
      card('4', 'c'),
      // верх — будут consumed первыми
      card('Q', 's'), // flop[2]
      card('J', 's'), // flop[1]
      card('10', 's'), // flop[0]
      card('K', 'h'), // burn (consumed first)
    ];
    const { cards: flop, remainingDeck } = dealCommunityCards(top, 3);
    // pop порядок: K♥ (burn), 10♠, J♠, Q♠
    expect(flop).toEqual([
      { rank: '10', suit: 'spades' },
      { rank: 'J', suit: 'spades' },
      { rank: 'Q', suit: 'spades' },
    ]);
    expect(remainingDeck).toHaveLength(3);
  });

  it('не мутирует входной массив', () => {
    const deck = createDeck();
    const snapshot = [...deck];
    dealCommunityCards(deck, 3);
    expect(deck).toEqual(snapshot);
  });
});

describe('getFutureBoardCards — peek будущих карт с учётом burn', () => {
  it('alreadyOnBoard=0 (preflop): возвращает 5 карт (3 flop + 1 turn + 1 river), пропуская 3 burn', () => {
    const deck = createDeck();
    const future = getFutureBoardCards(deck, 0);
    expect(future).toHaveLength(5);
  });

  it('alreadyOnBoard=3 (flop открыт): возвращает 2 карты (turn + river), пропуская 2 burn', () => {
    const deck = createDeck();
    const future = getFutureBoardCards(deck, 3);
    expect(future).toHaveLength(2);
  });

  it('alreadyOnBoard=4 (turn открыт): возвращает 1 карту (river), пропуская 1 burn', () => {
    const deck = createDeck();
    const future = getFutureBoardCards(deck, 4);
    expect(future).toHaveLength(1);
  });

  it('alreadyOnBoard=5 (ривер открыт): возвращает []', () => {
    expect(getFutureBoardCards(createDeck(), 5)).toEqual([]);
  });

  it('alreadyOnBoard=0 на пустой колоде → []', () => {
    expect(getFutureBoardCards([], 0)).toEqual([]);
  });

  it('preflop peek даёт ИМЕННО те карты, которые потом откроются на флоп/тёрн/ривер', () => {
    // Конструируем известную колоду, потом «играем» три фазы и сравниваем
    // Помним: pop с конца — последняя карта массива берётся первой.
    // После 2 hole-карт раздачи (на 2 игроков = 4 pop) на верху должно быть:
    //   [..., river_burn, river, turn_burn, turn, flop_burn, flop1, flop2, flop3, p1c2, p1c1, p0c2, p0c1]
    const deck = [
      // дно (consumed last) — padding не важен
      card('2', 'c'), card('3', 'c'), card('4', 'c'), card('5', 'c'),
      card('6', 'c'), card('7', 'c'), card('8', 'c'), card('9', 'c'),
      // river
      card('A', 'd'),
      // burn перед river
      card('2', 'd'),
      // turn
      card('K', 'd'),
      // burn перед turn
      card('3', 'd'),
      // flop3, flop2, flop1
      card('Q', 'd'), card('J', 'd'), card('10', 'd'),
      // burn перед flop
      card('4', 'd'),
      // hole-карты (раздаются первыми)
      card('5', 'h'), card('6', 'h'), card('7', 'h'), card('8', 'h'),
    ];
    // Раздадим hole-карты
    const { remainingDeck: afterHole } = dealCards(deck, 2);
    // Сейчас alreadyOnBoard=0, peek должен показать [10♦, J♦, Q♦, K♦, A♦]
    const futurePreflop = getFutureBoardCards(afterHole, 0);
    expect(futurePreflop).toEqual([
      { rank: '10', suit: 'diamonds' },
      { rank: 'J', suit: 'diamonds' },
      { rank: 'Q', suit: 'diamonds' },
      { rank: 'K', suit: 'diamonds' },
      { rank: 'A', suit: 'diamonds' },
    ]);

    // Раздаём flop
    const { cards: flop, remainingDeck: afterFlop } = dealCommunityCards(afterHole, 3);
    expect(flop).toEqual([
      { rank: '10', suit: 'diamonds' },
      { rank: 'J', suit: 'diamonds' },
      { rank: 'Q', suit: 'diamonds' },
    ]);
    expect(getFutureBoardCards(afterFlop, 3)).toEqual([
      { rank: 'K', suit: 'diamonds' },
      { rank: 'A', suit: 'diamonds' },
    ]);

    // Раздаём turn
    const { cards: turn, remainingDeck: afterTurn } = dealCommunityCards(afterFlop, 1);
    expect(turn).toEqual([{ rank: 'K', suit: 'diamonds' }]);
    expect(getFutureBoardCards(afterTurn, 4)).toEqual([{ rank: 'A', suit: 'diamonds' }]);

    // Раздаём river
    const { cards: river } = dealCommunityCards(afterTurn, 1);
    expect(river).toEqual([{ rank: 'A', suit: 'diamonds' }]);
  });
});

// Хелперы для построения карт и колод в тестах.
// Card-тип повторно объявлен локально — он же повторяется в hands.ts/deck.ts/GameManager.ts
// из-за rootDir-ограничения tsconfig (см. CLAUDE.md §3, §11.45). Структурно совместим.

import type { Suit, Rank, Card } from '../../types.js';
export type { Suit, Rank, Card };

const SUIT_MAP: Record<string, Suit> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
};

const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// card('A', 's') → { rank: 'A', suit: 'spades' }
// Принимает односимвольную масть (s/h/d/c) или полное имя.
export function card(rank: Rank, suit: 's' | 'h' | 'd' | 'c' | Suit): Card {
  const s = (suit as string).length === 1 ? SUIT_MAP[suit as string] : (suit as Suit);
  if (!s) throw new Error('Unknown suit: ' + suit);
  return { rank, suit: s };
}

// Распарсить строку вида "As Kh Qd Jc 10s" в массив Card.
// Полезно для коротких списков карт в тестах ранкинга.
export function cards(spec: string): Card[] {
  return spec
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const suit = token.slice(-1) as 's' | 'h' | 'd' | 'c';
      const rank = token.slice(0, -1) as Rank;
      return card(rank, suit);
    });
}

// Построить полную 52-карточную колоду из набора карт, перечисленных в ПОРЯДКЕ РАЗДАЧИ
// (первая карта в аргументах = первая раздаваемая). Возвращает массив, пригодный для
// использования в GameManager.startGame(roomId, testDeck) — учитывает pop()-семантику
// (dealCards/dealCommunityCards берут с конца массива).
//
// Карты, которые не указаны, добавляются в начало массива (будут потреблены последними
// — то есть никогда, если тест не доходит до конца колоды).
//
// Бросает, если в dealOrder есть дубликаты.
export function buildDeck(...dealOrder: Card[]): Card[] {
  const seen = new Set<string>();
  for (const c of dealOrder) {
    const key = c.rank + '|' + c.suit;
    if (seen.has(key)) throw new Error('Duplicate card in deck: ' + c.rank + c.suit[0]);
    seen.add(key);
  }

  const padding: Card[] = [];
  for (const s of ALL_SUITS) {
    for (const r of ALL_RANKS) {
      const key = r + '|' + s;
      if (!seen.has(key)) padding.push({ rank: r, suit: s });
    }
  }

  if (dealOrder.length + padding.length !== 52) {
    throw new Error('Deck math: ' + dealOrder.length + ' + ' + padding.length + ' !== 52');
  }

  // Семантика pop(): последний элемент массива раздаётся первым. Поэтому dealOrder
  // должен лежать в конце массива в обратном порядке (последняя карта в dealOrder ближе
  // к началу куска "deal-tail", а первая — в самом конце массива).
  return [...padding, ...[...dealOrder].reverse()];
}

// Короткая форма для тестов hand-ранкинга: построить 7-карточный набор (2 hole + 5 board).
// Не использует buildDeck — это для прямого вызова evaluateHand.
export function hand(holeAndBoard: string): { hole: Card[]; board: Card[] } {
  const all = cards(holeAndBoard);
  if (all.length !== 7) {
    throw new Error('hand() expects exactly 7 cards (2 hole + 5 board), got ' + all.length);
  }
  return {
    hole: all.slice(0, 2),
    board: all.slice(2),
  };
}

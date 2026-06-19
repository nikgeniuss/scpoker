// Cross-verification: наш evaluateHand vs независимая реализация pokersolver.
// Цель — поймать класс багов вроде A2 (steel wheel) и A9 (two trips → full house)
// до того как они доедут до production.
//
// Стратегия: генерируем N случайных раздач по 7 карт, сравниваем категорию руки.
// Затем — генерируем N пар рук на общем борде, сравниваем результат comparison.
//
// Если этот тест начинает падать после правок hands.ts — починить hands.ts (или явно
// сказать пользователю, что pokersolver не прав в этом edge-case'е).
import { describe, it } from 'vitest';
// @ts-expect-error — у pokersolver нет .d.ts
import { Hand } from 'pokersolver';
import { evaluateHand, compareHands } from '../hands.js';
import type { Card, Suit, Rank } from './helpers/cards.js';

const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_TO_SOLVER: Record<Suit, string> = {
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
  spades: 's',
};

const RANK_TO_SOLVER: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', '10': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

// Наш HandRank → pokersolver name
const OUR_TO_SOLVER_NAME: Record<string, string> = {
  'high-card': 'High Card',
  'pair': 'Pair',
  'two-pair': 'Two Pair',
  'three-of-a-kind': 'Three of a Kind',
  'straight': 'Straight',
  'flush': 'Flush',
  'full-house': 'Full House',
  'four-of-a-kind': 'Four of a Kind',
  'straight-flush': 'Straight Flush',
  'royal-flush': 'Royal Flush',
};

// pokersolver не выделяет роял-флеш отдельным .name — отдаёт 'Straight Flush'.
// Роял — это туз-хай стрейт-флеш (та же КАТЕГОРИЯ). Нормализуем обе стороны, чтобы
// сверка категорий не падала на этом edge-case'е; корректность РАНЖИРОВАНИЯ роял/стрейт-флеша
// проверяет второй тест (compareHands). Игровую логику не трогаем (§0.5).
function normalizeFlushName(name: string): string {
  return name === 'Royal Flush' ? 'Straight Flush' : name;
}

function toSolverCard(c: Card): string {
  return RANK_TO_SOLVER[c.rank] + SUIT_TO_SOLVER[c.suit];
}

function toSolverCards(cs: Card[]): string[] {
  return cs.map(toSolverCard);
}

// Сгенерировать N уникальных случайных карт из стандартной 52-карточной колоды
function randomCards(n: number): Card[] {
  const deck: Card[] = [];
  for (const s of ALL_SUITS) {
    for (const r of ALL_RANKS) {
      deck.push({ rank: r, suit: s });
    }
  }
  // Fisher-Yates partial shuffle
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}

// Карты для красивого вывода ошибки
function describeCards(cs: Card[]): string {
  return cs.map((c) => c.rank + c.suit[0].toUpperCase()).join(' ');
}

describe('hands.ts cross-verify против pokersolver', () => {
  it('категория руки на 5000 случайных раздач по 7 карт', () => {
    const ITERATIONS = 5000;
    const failures: Array<{ cards: Card[]; ours: string; solver: string }> = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const seven = randomCards(7);
      const hole = seven.slice(0, 2);
      const board = seven.slice(2);
      const ours = evaluateHand(hole, board);
      const solverHand = Hand.solve(toSolverCards(seven));
      const ourSolverName = OUR_TO_SOLVER_NAME[ours.rank];

      if (normalizeFlushName(ourSolverName) !== normalizeFlushName(solverHand.name)) {
        failures.push({ cards: seven, ours: ours.rank, solver: solverHand.name });
      }
    }

    if (failures.length > 0) {
      const first = failures[0];
      throw new Error(
        `${failures.length}/${ITERATIONS} расхождений категории руки.\n` +
        `Пример: ${describeCards(first.cards)}\n` +
        `  наш: ${first.ours}\n` +
        `  pokersolver: ${first.solver}`,
      );
    }
  });

  it('сравнение двух рук на общем борде, 2000 случайных раздач', () => {
    const ITERATIONS = 2000;
    const failures: Array<{
      board: Card[]; holeA: Card[]; holeB: Card[];
      ours: number; solver: 'A' | 'B' | 'tie';
    }> = [];

    for (let i = 0; i < ITERATIONS; i++) {
      // Общая раздача: 9 уникальных карт (5 board + 2 holeA + 2 holeB)
      const nine = randomCards(9);
      const board = nine.slice(0, 5);
      const holeA = nine.slice(5, 7);
      const holeB = nine.slice(7, 9);

      const ourA = evaluateHand(holeA, board);
      const ourB = evaluateHand(holeB, board);
      const ourCmp = compareHands(ourA, ourB); // > 0: A wins, < 0: B wins, 0: tie

      const handA = Hand.solve(toSolverCards([...holeA, ...board]));
      const handB = Hand.solve(toSolverCards([...holeB, ...board]));
      const winners = Hand.winners([handA, handB]);
      let solverWinner: 'A' | 'B' | 'tie';
      if (winners.length === 2) solverWinner = 'tie';
      else if (winners[0] === handA) solverWinner = 'A';
      else solverWinner = 'B';

      const ourWinner: 'A' | 'B' | 'tie' =
        ourCmp > 0 ? 'A' : ourCmp < 0 ? 'B' : 'tie';

      if (ourWinner !== solverWinner) {
        failures.push({ board, holeA, holeB, ours: ourCmp, solver: solverWinner });
      }
    }

    if (failures.length > 0) {
      const first = failures[0];
      throw new Error(
        `${failures.length}/${ITERATIONS} расхождений сравнения рук.\n` +
        `Пример:\n` +
        `  board:  ${describeCards(first.board)}\n` +
        `  holeA:  ${describeCards(first.holeA)}\n` +
        `  holeB:  ${describeCards(first.holeB)}\n` +
        `  наш cmp = ${first.ours} (${first.ours > 0 ? 'A' : first.ours < 0 ? 'B' : 'tie'})\n` +
        `  pokersolver winner = ${first.solver}`,
      );
    }
  });
});

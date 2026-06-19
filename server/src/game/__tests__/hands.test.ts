import { describe, it, expect } from 'vitest';
import { evaluateHand, determineWinner, compareHands, formatHandName } from '../hands.js';
import { cards, hand } from './helpers/cards.js';

// Все тесты проверяют hands.ts против POKER_RULES.md §8 (ранкинг рук, шоудаун, кикеры).
// hands.ts — чистые функции, моки не нужны.

describe('evaluateHand — категории рук', () => {
  it('royal-flush: 10-J-Q-K-A одной масти', () => {
    const { hole, board } = hand('Ks Qs 10s Js As 2c 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('royal-flush');
    expect(r.value).toBe(10);
    expect(r.highCards).toEqual([14]);
    expect(r.cards).toHaveLength(5);
  });

  it('straight-flush: 9-10-J-Q-K одной масти', () => {
    const { hole, board } = hand('9h 10h Jh Qh Kh 2c 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight-flush');
    expect(r.highCards).toEqual([13]);
  });

  it('steel wheel: A-2-3-4-5 одной масти — straight-flush с highCard=5 (НЕ royal, НЕ туз)', () => {
    // Регрессия для §11.45 fix
    const { hole, board } = hand('Ah 2h 3h 4h 5h 9c Jd');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight-flush');
    expect(r.highCards).toEqual([5]);
  });

  it('four-of-a-kind: AAAA + кикер', () => {
    const { hole, board } = hand('As Ah Ad Ac Kh 7d 2c');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('four-of-a-kind');
    expect(r.highCards).toEqual([14, 13]); // ранг квадры + кикер
  });

  it('four-of-a-kind: выбирает старший кикер', () => {
    const { hole, board } = hand('As Ah Ad Ac Kh Qd 2c');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('four-of-a-kind');
    expect(r.highCards).toEqual([14, 13]); // K старше Q
  });

  it('full-house: AAA + KK', () => {
    const { hole, board } = hand('As Ah Ad Ks Kh 7d 2c');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('full-house');
    expect(r.highCards).toEqual([14, 13]);
  });

  it('full-house: trips + 2 пары — берёт старшую пару', () => {
    const { hole, board } = hand('As Ah Ad Ks Kh Qs Qh');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('full-house');
    expect(r.highCards).toEqual([14, 13]); // trips=A, pair=K (старше Q)
  });

  it('full-house: два сета → старший trips + второй как pair', () => {
    const { hole, board } = hand('As Ah Ad Ks Kh Kd 2c');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('full-house');
    expect(r.highCards).toEqual([14, 13]); // AAA + KK
  });

  it('flush: 5 одной масти, выбраны топ-5', () => {
    const { hole, board } = hand('As Ks Qs Js 9s 2c 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('flush');
    expect(r.highCards).toEqual([14, 13, 12, 11, 9]);
  });

  it('flush из 6 одной масти — берёт топ-5', () => {
    const { hole, board } = hand('As Ks Qs Js 9s 8s 2d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('flush');
    expect(r.highCards).toEqual([14, 13, 12, 11, 9]); // 8 отброшен
  });

  it('straight: 6-7-8-9-10 разных мастей', () => {
    const { hole, board } = hand('6s 7h 8d 9c 10s 2c 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight');
    expect(r.highCards).toEqual([10]);
  });

  it('straight: wheel A-2-3-4-5, highCard=5', () => {
    const { hole, board } = hand('As 2h 3d 4c 5s 9d Jc');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight');
    expect(r.highCards).toEqual([5]); // туз снизу
  });

  it('straight: broadway 10-J-Q-K-A разных мастей, highCard=14', () => {
    const { hole, board } = hand('10s Jh Qd Kc As 2h 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight');
    expect(r.highCards).toEqual([14]);
  });

  it('straight: 6 подряд — берёт старший (5-6-7-8-9-10 → 10-high)', () => {
    const { hole, board } = hand('5s 6h 7d 8c 9s 10h 2d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight');
    expect(r.highCards).toEqual([10]);
  });

  it('straight НЕ wrap K-A-2-3-4', () => {
    const { hole, board } = hand('Ks Ah 2d 3c 4s 7h 9d');
    const r = evaluateHand(hole, board);
    expect(r.rank).not.toBe('straight');
    // Должна быть просто старшая карта (пары/трипса/etc нет)
    expect(r.rank).toBe('high-card');
  });

  it('three-of-a-kind: AAA + 2 кикера', () => {
    const { hole, board } = hand('As Ah Ad Kh Qd 7c 2s');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('three-of-a-kind');
    expect(r.highCards).toEqual([14, 13, 12]);
  });

  it('two-pair: AA + KK + кикер', () => {
    const { hole, board } = hand('As Ah Ks Kh Qd 7c 2s');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('two-pair');
    expect(r.highCards).toEqual([14, 13, 12]);
  });

  it('two-pair: 3 пары — берёт топ-2, кикер из третьей', () => {
    const { hole, board } = hand('As Ah Ks Kh Qs Qh 2d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('two-pair');
    expect(r.highCards).toEqual([14, 13, 12]); // AA, KK, кикер=Q
  });

  it('one-pair: AA + 3 кикера', () => {
    const { hole, board } = hand('As Ah Kh Qd Jc 9s 2d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('pair');
    expect(r.highCards).toEqual([14, 13, 12, 11]);
  });

  it('high-card: топ-5 карт', () => {
    const { hole, board } = hand('As Kh Qd Jc 9s 7h 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('high-card');
    expect(r.highCards).toEqual([14, 13, 12, 11, 9]);
  });

  it('royal требует именно 10-J-Q-K-A (9-10-J-Q-K — это straight-flush)', () => {
    const { hole, board } = hand('9s 10s Js Qs Ks 2c 3d');
    const r = evaluateHand(hole, board);
    expect(r.rank).toBe('straight-flush');
    expect(r.rank).not.toBe('royal-flush');
  });
});

describe('compareHands — иерархия категорий', () => {
  // Pair-helpers: построить две руки и сравнить
  function compare(h1: string, h2: string, board: string): number {
    const c1 = cards(h1);
    const c2 = cards(h2);
    const cb = cards(board);
    return compareHands(evaluateHand(c1, cb), evaluateHand(c2, cb));
  }

  it('royal flush vs royal flush → 0 (tie)', () => {
    // На стандартном борде это невозможно (1 королевская масть на борде), но
    // через compareHands напрямую — оба возвращают [14] highCards.
    expect(compare('As Ks', 'Ah Kh', '10s Js Qs 10h Jh Qh')).toBe(0);
  });

  it('straight-flush 10-high beats 9-high', () => {
    expect(compare('6s 10s', '5s 9s', '7s 8s 9s 2c 3d')).toBeGreaterThan(0);
  });

  it('steel wheel (5-high SF) loses to 6-high SF', () => {
    // Регрессия для §11.45 — wheel должен быть слабейшим стрит-флешем
    const wheel = evaluateHand(cards('Ah 2h'), cards('3h 4h 5h 9c Jd'));
    const sixHigh = evaluateHand(cards('2s 6s'), cards('3s 4s 5s 9c Jd'));
    expect(wheel.rank).toBe('straight-flush');
    expect(wheel.highCards).toEqual([5]);
    expect(sixHigh.rank).toBe('straight-flush');
    expect(sixHigh.highCards).toEqual([6]);
    expect(compareHands(wheel, sixHigh)).toBeLessThan(0);
  });

  it('steel wheel still beats quads (SF > quads)', () => {
    // wheel SF из борда 3h4h5h + Ah2h hole
    // quads из 9s9c + 9d (board) + 9h... wait, no 9h.
    // Перестроим: quads нужно 4 девятки. На борде есть 9c 9d. Я даю 9s 9h как hole.
    const wheel2 = evaluateHand(cards('Ah 2h'), cards('3h 4h 5h 9c Jd'));
    const quads2 = evaluateHand(cards('9s 9h'), cards('9c 9d 5s Jc 2d'));
    expect(wheel2.rank).toBe('straight-flush');
    expect(quads2.rank).toBe('four-of-a-kind');
    expect(compareHands(wheel2, quads2)).toBeGreaterThan(0);
  });

  it('quads K beats quads Q', () => {
    expect(compare('Ks Kh', 'Qs Qh', 'Kd Kc Qd Qc 2s')).toBeGreaterThan(0);
  });

  it('quads K with kicker A beats quads K with kicker Q', () => {
    const a = evaluateHand(cards('Ks As'), cards('Kh Kd Kc Qh 2s'));
    const b = evaluateHand(cards('Ks Qh'), cards('Kh Kd Kc Jh 2s'));
    expect(a.rank).toBe('four-of-a-kind');
    expect(b.rank).toBe('four-of-a-kind');
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('full house: trips rank доминирует — KKK22 > QQQAA', () => {
    const a = evaluateHand(cards('Ks Kh'), cards('Kd 2s 2h 7c 9d'));
    const b = evaluateHand(cards('Qs Qh'), cards('Qd As Ah 7c 9d'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('flush A-K-Q-J-9 beats A-K-Q-J-8 (5-я карта)', () => {
    const a = evaluateHand(cards('As Ks'), cards('Qs Js 9s 2c 3d'));
    const b = evaluateHand(cards('Ah Kh'), cards('Qh Jh 8h 2c 3d'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('flush A-K-Q-J-9 beats A-K-Q-10-2 (4-я карта)', () => {
    const a = evaluateHand(cards('As Ks'), cards('Qs Js 9s 2c 3d'));
    const b = evaluateHand(cards('Ah Kh'), cards('Qh 10h 2h 3c 4d'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('straight 7-high beats 6-high', () => {
    expect(compare('3s 7s', '2s 6s', '4h 5d 6c 7h Kd')).toBeGreaterThan(0);
  });

  it('wheel straight (5-high) is LOWEST — loses to 6-high', () => {
    const wheel = evaluateHand(cards('As 2h'), cards('3d 4c 5s 9h Jd'));
    const six = evaluateHand(cards('2s 6h'), cards('3d 4c 5s 9h Jd'));
    expect(wheel.rank).toBe('straight');
    expect(six.rank).toBe('straight');
    expect(compareHands(wheel, six)).toBeLessThan(0);
  });

  it('trips A beats trips K', () => {
    expect(compare('As Ah', 'Ks Kh', 'Ad Kd Qc 7h 3d')).toBeGreaterThan(0);
  });

  it('trips A with kicker K-Q beats trips A with kicker K-J', () => {
    const a = evaluateHand(cards('As Ah'), cards('Ad Ks Qd 9h 2c'));
    const b = evaluateHand(cards('As Ah'), cards('Ad Ks Jd 9h 2c'));
    // Q vs J на 2-м кикере
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('two pair: top pair tiebreak', () => {
    const a = evaluateHand(cards('Ks Kh'), cards('Qs Qh 2d 7c 3d'));
    const b = evaluateHand(cards('Qs Qh'), cards('Js Jh 2d 7c 3d'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('two pair: bottom pair tiebreak', () => {
    const a = evaluateHand(cards('Ks Kh'), cards('Qs Qh 7s 5d 3c'));
    const b = evaluateHand(cards('Ks Kh'), cards('Js Jh 7s 5d 3c'));
    // Top пара K у обоих, bottom пара Q vs J
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('two pair: kicker tiebreak', () => {
    const a = evaluateHand(cards('Ks Kh'), cards('Qs Qh As 5d 3c'));
    const b = evaluateHand(cards('Ks Kh'), cards('Qs Qh Js 5d 3c'));
    // top=K bottom=Q у обоих, кикер A vs J
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('pair A с кикерами K-Q-J beats pair A с K-Q-10 (3-й кикер)', () => {
    const a = evaluateHand(cards('As Ah'), cards('Kd Qc Jh 5d 3c'));
    const b = evaluateHand(cards('As Ah'), cards('Kd Qc 10h 5d 3c'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('high card A-K-Q-J-9 beats A-K-Q-J-8', () => {
    const a = evaluateHand(cards('As Kh'), cards('Qd Jc 9s 5h 3c'));
    const b = evaluateHand(cards('As Kh'), cards('Qd Jc 8s 5h 3c'));
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  // Cross-category иерархия (по §8.3 спека)
  it('straight beats trips', () => {
    expect(compare('5h 6c', 'As Ah', '7s 8d 9c 2h Ad')).toBeGreaterThan(0);
  });

  it('flush beats straight', () => {
    expect(compare('As Ks', '5h 6c', 'Qs Js 7s 8d 9c')).toBeGreaterThan(0);
  });

  it('full house beats flush', () => {
    expect(compare('Ks Kh', 'As Qs', 'Kd Qd Qh Js 9s')).toBeGreaterThan(0);
  });

  it('four of a kind beats full house', () => {
    expect(compare('Ks Kh', 'As Ah', 'Kd Kc Ad 7h 2c')).toBeGreaterThan(0);
  });

  it('straight flush beats four of a kind', () => {
    expect(compare('2s 6s', 'Ks Kh', '3s 4s 5s Kd Kc')).toBeGreaterThan(0);
  });

  it('royal flush beats straight flush', () => {
    expect(compare('As Ks', '5h 6h', 'Qs Js 10s 7h 8h')).toBeGreaterThan(0);
  });
});

describe('determineWinner — выбор победителей', () => {
  // Хелпер: build player records
  function pl(id: string, holeStr: string, folded = false) {
    return { id, hand: cards(holeStr), folded };
  }

  it('один не-folded игрок → возвращает его id (без eval)', () => {
    const board = cards('2c 3d 4h 5s 7c');
    const result = determineWinner([pl('A', 'As Kh'), pl('B', 'Qd Jc', true)], board);
    expect(result).toEqual(['A']);
  });

  it('все folded → возвращает []', () => {
    const board = cards('2c 3d 4h 5s 7c');
    const result = determineWinner([pl('A', 'As Kh', true), pl('B', 'Qd Jc', true)], board);
    expect(result).toEqual([]);
  });

  it('2 игрока, A чётко выигрывает', () => {
    const board = cards('2c 3d 4h 5s 7c');
    const result = determineWinner([pl('A', 'As Ah'), pl('B', '8d 9c')], board);
    expect(result).toEqual(['A']); // пара тузов > high card
  });

  it('2 игрока, точная ничья → split [A, B]', () => {
    // Оба собирают одинаковый стрит на борде
    const board = cards('5h 6d 7c 8s 9h');
    const result = determineWinner([pl('A', '2c 3d'), pl('B', '2h 3s')], board);
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(['A', 'B']));
  });

  it('3 игрока, A выигрывает', () => {
    const board = cards('2c 3d 4h 5s 7c');
    const result = determineWinner(
      [pl('A', 'As Ah'), pl('B', 'Kd Kh'), pl('C', '8s 9d')],
      board,
    );
    expect(result).toEqual(['A']);
  });

  it('3 игрока, A и B ничья выше C', () => {
    // На борде стрит — все игроки делят, кикер не помогает
    const board = cards('5h 6d 7c 8s 9h');
    const result = determineWinner(
      [pl('A', '2c 3d'), pl('B', '2h 3s'), pl('C', '2d 3c')],
      board,
    );
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(['A', 'B', 'C']));
  });

  it('folded игрок не участвует в shotdown', () => {
    const board = cards('2c 3d 4h 5s 7c');
    const result = determineWinner(
      [pl('A', 'As Ah', true), pl('B', 'Kd Kh'), pl('C', '8s 9d')],
      board,
    );
    expect(result).toEqual(['B']); // A folded, B (KK) > C (high card)
  });
});

describe('formatHandName — русские названия', () => {
  // Каждый кейс — это рука, после evaluateHand которой formatHandName выдаёт ожидаемую строку
  function nameOf(holeStr: string, boardStr: string): string {
    return formatHandName(evaluateHand(cards(holeStr), cards(boardStr)));
  }

  it("royal-flush → 'Роял-флеш'", () => {
    expect(nameOf('As Ks', 'Qs Js 10s 2c 3d')).toBe('Роял-флеш');
  });

  it("straight-flush до 9 → 'Стрит-флеш до 9'", () => {
    expect(nameOf('5s 9s', '6s 7s 8s 2c 3d')).toBe('Стрит-флеш до 9');
  });

  it("straight-flush wheel → 'Стрит-флеш до 5' (regression §11.45)", () => {
    expect(nameOf('Ah 2h', '3h 4h 5h 9c Jd')).toBe('Стрит-флеш до 5');
  });

  it("каре королей → 'Каре королей'", () => {
    expect(nameOf('Ks Kh', 'Kd Kc 2s 3h 7d')).toBe('Каре королей');
  });

  it("каре тузов → 'Каре тузов'", () => {
    expect(nameOf('As Ah', 'Ad Ac 2s 3h 7d')).toBe('Каре тузов');
  });

  it("fullhouse: десятки и валеты → 'Фулл-хаус: десяток и валетов'", () => {
    expect(nameOf('10s 10h', '10d Js Jh 2c 3d')).toBe('Фулл-хаус: десяток и валетов');
  });

  it("flush до туза → 'Флеш до туза'", () => {
    expect(nameOf('As 9s', 'Ks Qs Js 2c 3d')).toBe('Флеш до туза');
  });

  it("straight wheel → 'Стрит до 5'", () => {
    expect(nameOf('As 2h', '3d 4c 5s 9h Jd')).toBe('Стрит до 5');
  });

  it("straight до туза (broadway) → 'Стрит до туза'", () => {
    expect(nameOf('10s Jh', 'Qd Kc As 2h 3d')).toBe('Стрит до туза');
  });

  it("сет восьмёрок → 'Сет восьмёрок'", () => {
    expect(nameOf('8s 8h', '8d 2s 5h 9c Jd')).toBe('Сет восьмёрок');
  });

  it("две пары тузы и короли → 'Две пары: тузов и королей'", () => {
    expect(nameOf('As Ah', 'Ks Kh 2d 3c 9d')).toBe('Две пары: тузов и королей');
  });

  it("пара дам → 'Пара дам'", () => {
    expect(nameOf('Qs Qh', '2d 3c 5h 7s 9d')).toBe('Пара дам');
  });

  it("старшая карта туз → 'Старшая карта: туза'", () => {
    expect(nameOf('As Kh', 'Qd Jc 9s 7h 3d')).toBe('Старшая карта: туза');
  });
});

import { evaluateHand, compareHands } from './hands.js';
import { createDeck } from './deck.js';
import type { Card, GameFormat } from './types.js';

// Колоды по формату (NLH 52 / Шорт-дэк 36) — строятся один раз, источник «неизвестных» карт.
const DECKS: Record<GameFormat, Card[]> = { nlh: createDeck('nlh'), shortdeck: createDeck('shortdeck') };
const cardKey = (c: Card): string => c.rank + c.suit;

// Вероятность (0..1) выигрыша руки `hole` на борде `board` против `numOpponents` НЕИЗВЕСТНЫХ
// оппонентов на текущий момент. Монте-Карло: оппонентам и недостающим картам борда раздаём
// случайные карты из колоды БЕЗ знания их реальных карт (§0.1 — никакой утечки, считаем «как
// против случайных»). Сплиты учитываются долей (1/число победителей).
//   - rng по умолчанию Math.random; в тестах инжектируется детерминированный — без флака.
//   - hole<2 → 0; numOpponents<1 → 1 (выигрыш гарантирован, играть не с кем).
// Чистая функция — тестируется изолированно (equity.test.ts).
export function winProbabilityVsRandom(
  hole: Card[],
  board: Card[],
  numOpponents: number,
  iterations = 1000,
  rng: () => number = Math.random,
  format: GameFormat = 'nlh',
): number {
  if (hole.length < 2) return 0;
  if (numOpponents < 1) return 1;
  const used = new Set([...hole, ...board].map(cardKey));
  const pool = DECKS[format].filter((c) => !used.has(cardKey(c)));
  const boardNeed = 5 - board.length;
  const need = numOpponents * 2 + boardNeed;
  if (pool.length < need) return 0;

  let win = 0;
  for (let it = 0; it < iterations; it++) {
    // Частичный Fisher–Yates по копии пула: первые `need` элементов — равномерная случайная выборка.
    const p = pool.slice();
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (p.length - i));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    // Сначала добираем борд, затем по 2 карты каждому оппоненту.
    const fullBoard = board.concat(p.slice(0, boardNeed));
    const myRes = evaluateHand(hole, fullBoard, format);
    let beaten = false;
    let ties = 1; // считая себя
    let idx = boardNeed;
    for (let o = 0; o < numOpponents; o++) {
      const oppRes = evaluateHand([p[idx], p[idx + 1]], fullBoard, format);
      idx += 2;
      const cmp = compareHands(myRes, oppRes);
      if (cmp < 0) { beaten = true; break; }
      if (cmp === 0) ties++;
    }
    if (!beaten) win += 1 / ties;
  }
  return win / iterations;
}

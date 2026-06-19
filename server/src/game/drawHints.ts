import type { Card, Rank, GameFormat } from './types.js';

// Детект дро (ROADMAP §10.12) — флеш-дро (4 к флешу) и стрит-дро (4 к стриту, OESD/гатшот).
// Чистая логика поверх карманных+борда. Поддержка Шорт-дэка: младшее «колесо» A-6-7-8-9
// (туз снизу = 5), без рангов 2–5. Возвращает только НЕЗАВЕРШЁННЫЕ дро.

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export interface Draws {
  flushDraw: boolean;
  straightDraw: boolean;
}

export function detectDraws(hole: Card[], board: Card[], format: GameFormat = 'nlh'): Draws {
  const cards = hole.concat(board);
  if (cards.length < 4) return { flushDraw: false, straightDraw: false };

  // Флеш-дро: ровно 4 карты одной масти (5+ — это уже флеш, не дро).
  const bySuit: Record<string, number> = {};
  for (const c of cards) bySuit[c.suit] = (bySuit[c.suit] ?? 0) + 1;
  const flushDraw = Object.values(bySuit).some((n) => n === 4);

  // Стрит-дро: значения рангов в множество. Туз как 14 и как «низ колеса»:
  // NLH → 1 (A-2-3-4-5), Шорт-дэк → 5 (A-6-7-8-9).
  const lowAce = format === 'shortdeck' ? 5 : 1;
  const present = new Set<number>();
  for (const c of cards) {
    const v = RANK_VALUE[c.rank];
    present.add(v);
    if (v === 14) present.add(lowAce);
  }
  let hasStraight = false;
  let has4 = false;
  for (let start = 1; start <= 10; start++) {
    let cnt = 0;
    for (let v = start; v < start + 5; v++) if (present.has(v)) cnt++;
    if (cnt === 5) hasStraight = true;
    else if (cnt === 4) has4 = true;
  }
  const straightDraw = !hasStraight && has4;

  return { flushDraw, straightDraw };
}

// Русская метка дро для подсказки (или undefined, если дро нет).
export function drawLabel(draws: Draws): string | undefined {
  if (draws.straightDraw && draws.flushDraw) return 'Стрит- и флеш-дро';
  if (draws.flushDraw) return 'Флеш-дро';
  if (draws.straightDraw) return 'Стрит-дро';
  return undefined;
}

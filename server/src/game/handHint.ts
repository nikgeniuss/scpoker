import { evaluateHand, formatHandName } from './hands.js';
import { detectDraws, drawLabel } from './drawHints.js';
import type { Card, GameFormat } from './types.js';

// Читаемое русское название ТЕКУЩЕЙ комбинации игрока по доступным картам (карманные + борд).
// Работает на любой стадии (нужно ≥2 карманных): префлоп → пара/старшая, далее лучшие 5 из 7.
// На флопе/тёрне к названию дописывается незавершённое дро (Флеш-дро / Стрит-дро), §10.12.
// format меняет ранжир/стриты (Шорт-дэк). Чистая обёртка над hands.ts/drawHints.ts.
export function handHintName(hole: Card[], board: Card[], format: GameFormat = 'nlh'): string | undefined {
  if (hole.length < 2) return undefined;
  const result = evaluateHand(hole, board, format);
  let name = formatHandName(result);
  // Дро значимы только на флопе (3) и тёрне (4): на префлопе считать рано, на ривере добора нет.
  if (board.length === 3 || board.length === 4) {
    const draws = detectDraws(hole, board, format);
    // Не показываем дро, перекрытое собранной комбинацией. Значение флеша зависит от формата
    // (NLH 6, Шорт-дэк 7 — там флеш выше фулла, поэтому при фулле флеш-дро ещё полезно).
    const flushVal = format === 'shortdeck' ? 7 : 6;
    const showFlush = draws.flushDraw && result.value < flushVal;
    const showStraight = draws.straightDraw && result.value < 5;
    const label = drawLabel({ flushDraw: showFlush, straightDraw: showStraight });
    if (label) name += ' · ' + label;
  }
  return name;
}

// Числовой ранг ТЕКУЩЕЙ комбинации 1..9 (для шкалы силы руки на клиенте, HandStrengthMeter):
// 1 = старшая карта, ..., 9 = стрит-флеш/роял-флеш (роял объединён со стрит-флешем в одну
// верхнюю ступень — см. hands.ts value=10 для роял, здесь ограничиваем до 9). Чистая обёртка.
export function handRankValue(hole: Card[], board: Card[], format: GameFormat = 'nlh'): number | undefined {
  if (hole.length < 2) return undefined;
  const result = evaluateHand(hole, board, format);
  return Math.min(result.value, 9);
}

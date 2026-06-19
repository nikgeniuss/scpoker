// Bad Beat Jackpot — расчёт отчисления (дропа) в пул. Чистые функции (как rake.ts).
// Порядок: дроп берётся с ПОСТ-рейкового остатка банка. Источник правды по правилу — POKER_RULES.md.
import type { BadBeatState, BadBeatTier } from './badBeatService.js';

// Верхняя граница ББ тира из метки «0.01/0.02 ~ 0.05/0.10» → 0.10 (центы). «Higher» → Infinity.
// Блайнды в проекте — в центах (модель денег formatMoney /100), метки тиров — в долларах.
export function tierUpperBbCents(label: string): number {
  const right = label.split('~')[1]?.trim() ?? '';
  const last = right.split('/').pop()?.trim() ?? '';
  const v = parseFloat(last);
  return Number.isFinite(v) ? Math.round(v * 100) : Number.POSITIVE_INFINITY;
}

// Тир по блайндам стола: первый, в чей диапазон попадает bigBlind (тиры по возрастанию).
export function selectTier(tiers: BadBeatTier[], bigBlindCents: number): BadBeatTier | undefined {
  for (const t of tiers) {
    if (bigBlindCents <= tierUpperBbCents(t.blinds)) return t;
  }
  return tiers[tiers.length - 1];
}

// Дроп в центах с пост-рейкового остатка. dropMode='percent' → % от остатка;
// 'bb' → tier.bb × bigBlind. Зажимается в [0, postRakePot].
export function computeBadBeatDrop(
  state: BadBeatState,
  postRakePot: number,
  bigBlindCents: number,
): number {
  if (!state.enabled || postRakePot <= 0 || bigBlindCents <= 0) return 0;
  let drop: number;
  if (state.dropMode === 'percent') {
    drop = Math.floor((postRakePot * state.percent) / 100);
  } else {
    const tier = selectTier(state.tiers, bigBlindCents);
    drop = Math.floor((tier?.bb ?? 0) * bigBlindCents);
  }
  return Math.max(0, Math.min(drop, postRakePot));
}

// Рейк (комиссия рума с банка) — чистые функции. Per-table конфиг (ROADMAP §10.6).
// Правило «No flop, no drop»: если рука закончилась до флопа — рейк не берётся.
// Источник правды по правилу — POKER_RULES.md.

export interface RakeConfig {
  percent: number; // % от банка, 0..100 (0 = рейк выключен)
  capBb: number;   // потолок рейка в больших блайндах, 0..100
}

export const DEFAULT_RAKE: RakeConfig = { percent: 0, capBb: 0 };

// Рейк с банка раздачи. flopDealt=false (рука закончилась префлоп) → 0 (no flop, no drop).
// rake = min(floor(pot * percent/100), floor(capBb * bigBlind)).
export function computeRake(
  totalPot: number,
  bigBlind: number,
  cfg: RakeConfig,
  flopDealt: boolean,
): number {
  if (!flopDealt) return 0;
  if (!cfg || cfg.percent <= 0 || totalPot <= 0) return 0;
  const byPercent = Math.floor((totalPot * cfg.percent) / 100);
  const cap = Math.floor(cfg.capBb * bigBlind);
  return Math.max(0, Math.min(byPercent, cap));
}

// Валидация per-table рейк-конфига (из CreateRoomOptions). Стиль 1:1 с roomValidation.
export function validateRakeConfig(rake: RakeConfig): string | null {
  if (typeof rake.percent !== 'number' || !Number.isFinite(rake.percent) || rake.percent < 0 || rake.percent > 100) {
    return 'rake.percent: 0..100';
  }
  if (typeof rake.capBb !== 'number' || !Number.isFinite(rake.capBb) || rake.capBb < 0 || rake.capBb > 100) {
    return 'rake.capBb: 0..100';
  }
  return null;
}

// Нормализация для записи на стол: округлить (percent — 1 знак, capBb — целое) и зажать границы.
export function normalizeRake(rake: RakeConfig | undefined): RakeConfig {
  if (!rake) return { ...DEFAULT_RAKE };
  return {
    percent: Math.max(0, Math.min(100, Math.round(rake.percent * 10) / 10)),
    capBb: Math.max(0, Math.min(100, Math.round(rake.capBb))),
  };
}

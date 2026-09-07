import { randomInt } from 'crypto';
import { readJSON, writeJSON } from '../auth/storage.js';

// Сундуки — рандомизированная награда вместо фиксированной (ROADMAP §10.21.7, вариант А).
// Надстройка над уже готовыми механиками: там, где миссия/достижение выдавало фиксированное
// число HUB-коинов, можно указать сундук — и сервер выбирает приз по весам таблицы.
// Три правила, заданные при проектировании:
//   1. RNG — только серверный и криптостойкий (`crypto.randomInt`, не `Math.random`): клиент
//      получает уже готовый результат и лишь проигрывает анимацию открытия.
//   2. Шансы показываются игроку ОТКРЫТО (эндпоинт отдаёт проценты) — по опыту румов из ресёрча
//      непрозрачные шансы дают жалобы и недоверие, плюс это серая зона регулирования лутбоксов.
//   3. Награда — HUB-коины, не реальные деньги (§10.21, §0.14).
// Источник правды — server/data/chests.json (атомарно через writeJSON, §0.4).
import type { ChestDef, ChestPrize } from '@poker-room/shared';

const FILE = 'chests.json';

export type { ChestDef, ChestPrize };

interface ChestsState {
  enabled: boolean;
  chests: ChestDef[];
}

const DEFAULT_CHESTS: ChestDef[] = [
  {
    id: 'chest-small',
    title: 'Малый сундук',
    prizes: [
      { weight: 70, amount: 5 },
      { weight: 25, amount: 20 },
      { weight: 5, amount: 100 },
    ],
  },
  {
    id: 'chest-big',
    title: 'Большой сундук',
    prizes: [
      { weight: 60, amount: 25 },
      { weight: 30, amount: 75 },
      { weight: 10, amount: 300 },
    ],
  },
];

// === Чистая часть ===

export function totalWeight(prizes: readonly ChestPrize[]): number {
  return prizes.reduce((sum, p) => sum + p.weight, 0);
}

// Приз по «броску» roll ∈ [0, totalWeight). Чистая функция — RNG инжектируется снаружи, поэтому
// раскладка призов тестируется без случайности.
export function pickPrize(prizes: readonly ChestPrize[], roll: number): ChestPrize | null {
  const total = totalWeight(prizes);
  if (prizes.length === 0 || total <= 0) return null;
  const bounded = Math.min(Math.max(0, Math.floor(roll)), total - 1);
  let acc = 0;
  for (const p of prizes) {
    acc += p.weight;
    if (bounded < acc) return p;
  }
  return prizes[prizes.length - 1]; // недостижимо при корректных весах — страховка от дрейфа сумм
}

// Шансы для открытого показа игроку. Проценты округляются для UI, веса остаются источником правды.
export function chestOdds(prizes: readonly ChestPrize[]): { amount: number; percent: number }[] {
  const total = totalWeight(prizes);
  if (total <= 0) return [];
  return prizes.map((p) => ({ amount: p.amount, percent: Math.round((p.weight / total) * 1000) / 10 }));
}

// === Санитизация и файловые обёртки ===

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizePrizes(v: unknown): ChestPrize[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Partial<ChestPrize>;
      return { weight: Math.round(num(r.weight, 0)), amount: Math.round(num(r.amount, 0)) };
    })
    .filter((p): p is ChestPrize => p !== null && p.weight > 0); // нулевой вес = приз недостижим
}

function sanitizeChest(raw: unknown): ChestDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ChestDef>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  const prizes = sanitizePrizes(r.prizes);
  if (prizes.length === 0) return null; // сундук без достижимых призов не сохраняем
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Сундук',
    prizes,
  };
}

function sanitizeChests(v: unknown): ChestDef[] {
  if (!Array.isArray(v)) return [];
  const out: ChestDef[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const c = sanitizeChest(raw);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

function defaults(): ChestsState {
  return { enabled: false, chests: DEFAULT_CHESTS.map((c) => ({ ...c, prizes: c.prizes.map((p) => ({ ...p })) })) };
}

function load(): ChestsState {
  try {
    const s = readJSON(FILE) as Partial<ChestsState>;
    const d = defaults();
    const chests = sanitizeChests(s.chests);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      chests: chests.length ? chests : d.chests,
    };
  } catch {
    return defaults();
  }
}

export function getChestsConfig(): { enabled: boolean; chests: ChestDef[] } {
  const s = load();
  return { enabled: s.enabled, chests: s.chests };
}

// Публичная вьюшка: шансы открыто, как и обещано игроку.
export function getChestsPublic(): { enabled: boolean; chests: { id: string; title: string; odds: { amount: number; percent: number }[] }[] } {
  const s = load();
  return {
    enabled: s.enabled,
    chests: s.chests.map((c) => ({ id: c.id, title: c.title, odds: chestOdds(c.prizes) })),
  };
}

export function updateChestsSettings(
  patch: Partial<{ enabled: boolean; chests: ChestDef[] }>,
): { enabled: boolean; chests: ChestDef[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.chests)) {
    const sanitized = sanitizeChests(patch.chests);
    if (sanitized.length) s.chests = sanitized;
  }
  writeJSON(FILE, s);
  return { enabled: s.enabled, chests: s.chests };
}

// Открыть сундук: сумма приза + название (для тоста игроку). null — сундуки выключены, такого
// сундука нет или в нём не осталось достижимых призов; вызывающий тогда платит фиксированную
// награду, как раньше — механика наград не должна ломаться из-за настроек сундуков.
export function openChest(chestId: string): { amount: number; title: string } | null {
  const s = load();
  if (!s.enabled) return null;
  const chest = s.chests.find((c) => c.id === chestId);
  if (!chest) return null;
  const total = totalWeight(chest.prizes);
  if (total <= 0) return null;
  const prize = pickPrize(chest.prizes, randomInt(total)); // крипто-RNG, не Math.random
  return prize ? { amount: prize.amount, title: chest.title } : null;
}

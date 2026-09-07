// Рейкбэк — VIP-кэшбэк % от уплаченного рейка по накопительным уровням (как GGPoker Ocean Rewards).
// Уровень определяется LIFETIME-рейком игрока (накопительно, без сброса) — не понижается.
// Источник правды — server/data/rakeback.json (атомарно через writeJSON, §0.4). Файл в data/,
// nodemon не watch'ит (§0.3) — записи не рестартят сервер.
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'rakeback.json';
const HISTORY_CAP = 200;
// Скользящее недельное окно для карточки «Кэшбэк недели» на /rewards. Считаем его per-user
// счётчиком, а не по history: HISTORY_CAP — общий кап на ВСЕХ игроков сразу, на живом столе
// он смывается быстрее недели (ROADMAP §10.21.8).
const WEEK_MS = 7 * 24 * 60 * 60_000;

export interface RakebackTier {
  name: string;
  minRakeCents: number; // порог lifetime-рейка для входа в уровень (центы)
  percent: number;      // % кэшбэка с каждой раздачи на этом уровне
}

export interface RakebackHistoryEntry {
  t: number;
  userId: string;
  roomId: string;
  rakeAmount: number; // уплаченный рейк за раздачу (центы)
  payout: number;     // начисленный кэшбэк (центы)
  tierName: string;
}

export interface RakebackUserState {
  lifetimeRake: number; // накопленный рейк за всё время (определяет уровень)
  totalPaid: number;    // всего получено кэшбэка
  weeklyPaid: number;   // получено кэшбэка в текущем недельном окне
  weekStartAt: number;  // начало текущего недельного окна (epoch ms; 0 — окна ещё не было)
}

export interface RakebackState {
  enabled: boolean;
  tiers: RakebackTier[];
  users: Record<string, RakebackUserState>;
  history: RakebackHistoryEntry[];
}

const DEFAULT_TIERS: RakebackTier[] = [
  { name: 'Bronze', minRakeCents: 0, percent: 10 },
  { name: 'Silver', minRakeCents: 2_500, percent: 20 },
  { name: 'Gold', minRakeCents: 10_000, percent: 30 },
  { name: 'Platinum', minRakeCents: 50_000, percent: 40 },
  { name: 'Diamond', minRakeCents: 200_000, percent: 50 },
];

function defaults(): RakebackState {
  return { enabled: false, tiers: DEFAULT_TIERS.map((t) => ({ ...t })), users: {}, history: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeTier(t: Partial<RakebackTier>): RakebackTier {
  return {
    name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Tier',
    minRakeCents: Math.round(num(t.minRakeCents, 0)),
    percent: Math.max(0, Math.min(100, num(t.percent, 0))),
  };
}

function sortedTiers(tiers: RakebackTier[]): RakebackTier[] {
  return [...tiers].sort((a, b) => a.minRakeCents - b.minRakeCents);
}

function sanitizeUsers(v: unknown): Record<string, RakebackUserState> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, RakebackUserState> = {};
  for (const [id, raw] of Object.entries(v as Record<string, Partial<RakebackUserState>>)) {
    out[id] = {
      lifetimeRake: num(raw?.lifetimeRake, 0),
      totalPaid: num(raw?.totalPaid, 0),
      weeklyPaid: num(raw?.weeklyPaid, 0),   // записи до появления полей — с нуля
      weekStartAt: num(raw?.weekStartAt, 0),
    };
  }
  return out;
}

function load(): RakebackState {
  try {
    const s = readJSON(FILE) as Partial<RakebackState>;
    const d = defaults();
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      tiers: Array.isArray(s.tiers) && s.tiers.length ? sortedTiers(s.tiers.map(sanitizeTier)) : d.tiers,
      users: sanitizeUsers(s.users),
      history: Array.isArray(s.history) ? s.history.slice(0, HISTORY_CAP) : d.history,
    };
  } catch {
    return defaults();
  }
}

function save(s: RakebackState): void {
  writeJSON(FILE, s);
}

// Текущий уровень по lifetime-рейку — чистая функция (наибольший порог ≤ lifetimeRake).
export function pickTier(tiers: RakebackTier[], lifetimeRakeCents: number): RakebackTier {
  const sorted = sortedTiers(tiers);
  let current: RakebackTier = sorted[0] ?? { name: 'Bronze', minRakeCents: 0, percent: 0 };
  for (const t of sorted) {
    if (lifetimeRakeCents >= t.minRakeCents) current = t;
  }
  return current;
}

// Следующий уровень (для прогресс-бара); null — уже максимальный.
export function pickNextTier(tiers: RakebackTier[], lifetimeRakeCents: number): RakebackTier | null {
  const sorted = sortedTiers(tiers);
  for (const t of sorted) {
    if (lifetimeRakeCents < t.minRakeCents) return t;
  }
  return null;
}

// Сдвиг недельного окна — чистая функция. Окно ещё не начиналось или истекло (прошло >= 7 суток)
// → начинается заново с нуля; иначе состояние как есть.
export function rollWeekly(
  u: { weeklyPaid: number; weekStartAt: number },
  now: number,
): { weeklyPaid: number; weekStartAt: number } {
  if (u.weekStartAt <= 0 || now - u.weekStartAt >= WEEK_MS) return { weeklyPaid: 0, weekStartAt: now };
  return { weeklyPaid: u.weeklyPaid, weekStartAt: u.weekStartAt };
}

// Кэшбэк с одной раздачи — чистая функция.
export function computeRakebackPayout(rakeCents: number, tier: RakebackTier): number {
  if (rakeCents <= 0 || tier.percent <= 0) return 0;
  return Math.floor((rakeCents * tier.percent) / 100);
}

// Полное состояние (для админки).
export function getRakebackState(): RakebackState {
  return load();
}

// Публичная вьюшка (любой игрок может посмотреть таблицу уровней без авторизации).
export function getRakebackPublic(): { enabled: boolean; tiers: RakebackTier[] } {
  const s = load();
  return { enabled: s.enabled, tiers: s.tiers };
}

export interface UserRakebackInfo {
  enabled: boolean;
  lifetimeRake: number;
  totalPaid: number;
  weeklyPaid: number;   // кэшбэк за текущее недельное окно (карточка «Кэшбэк недели»)
  weekStartAt: number;  // начало окна; 0 — начислений ещё не было
  tier: RakebackTier;
  nextTier: RakebackTier | null;
  tiers: RakebackTier[];
  history: RakebackHistoryEntry[]; // только свои записи, последние 50
}

// Личный кабинет рейкбэка игрока.
export function getUserRakebackInfo(userId: string): UserRakebackInfo {
  const s = load();
  const u = s.users[userId] ?? { lifetimeRake: 0, totalPaid: 0, weeklyPaid: 0, weekStartAt: 0 };
  const tier = pickTier(s.tiers, u.lifetimeRake);
  const next = pickNextTier(s.tiers, u.lifetimeRake);
  const history = s.history.filter((h) => h.userId === userId).slice(0, 50);
  // Окно сдвигаем на чтении тоже: истёкшая неделя должна показывать 0, не дожидаясь следующей
  // раздачи. Результат не сохраняем — чтение не должно писать в файл.
  const week = rollWeekly(u, Date.now());
  return {
    enabled: s.enabled,
    lifetimeRake: u.lifetimeRake,
    totalPaid: u.totalPaid,
    weeklyPaid: week.weeklyPaid,
    weekStartAt: u.weekStartAt,
    tier,
    nextTier: next,
    tiers: s.tiers,
    history,
  };
}

// Обновление конфига админом (toggle + таблица уровней).
export function updateRakebackSettings(patch: Partial<Pick<RakebackState, 'enabled' | 'tiers'>>): RakebackState {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.tiers) && patch.tiers.length) s.tiers = sortedTiers(patch.tiers.map(sanitizeTier));
  save(s);
  return s;
}

// Применить рейкбэк за одну раздачу: добавить рейк к lifetime-счётчику игрока, определить
// уровень ПО ОБНОВЛЁННОМУ lifetime (апгрейд уровня применяется сразу же), начислить %.
// null — фича выключена или рейк за раздачу нулевой (тогда копить/писать историю не нужно).
export function applyRakeback(
  userId: string,
  roomId: string,
  rakeCents: number,
): { payout: number; tier: RakebackTier } | null {
  if (rakeCents <= 0) return null;
  const s = load();
  if (!s.enabled) return null;
  const u = s.users[userId] ?? { lifetimeRake: 0, totalPaid: 0, weeklyPaid: 0, weekStartAt: 0 };
  u.lifetimeRake += rakeCents;
  const tier = pickTier(s.tiers, u.lifetimeRake);
  const payout = computeRakebackPayout(rakeCents, tier);
  u.totalPaid += payout;
  const week = rollWeekly(u, Date.now());
  u.weeklyPaid = week.weeklyPaid + payout;
  u.weekStartAt = week.weekStartAt;
  s.users[userId] = u;
  if (payout > 0) {
    s.history = [
      { t: Date.now(), userId, roomId, rakeAmount: rakeCents, payout, tierName: tier.name },
      ...s.history,
    ].slice(0, HISTORY_CAP);
  }
  save(s);
  return { payout, tier };
}

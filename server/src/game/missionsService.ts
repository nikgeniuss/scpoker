// Недельные миссии — повторяющиеся задания с наградой в HUB-коинах (ROADMAP §10.21.3, доделка).
// Отличие от достижений: у миссии есть период. Достижение — одноразовая веха за всю жизнь, её
// прогресс считается на лету (compute-on-read); миссия сбрасывается каждую неделю, и её прогресс
// по журналу раздач считать НЕЛЬЗЯ: `hands.json` обрезается капом сразу по ВСЕМ игрокам, на живом
// трафике неделя в него может не поместиться — прогресс молча поехал бы назад (тот же класс бага,
// что чинили в ROI профиля и турнирных достижениях 2026-09-06). Поэтому здесь свои per-user
// счётчики, инкрементируемые в момент события (конец раздачи / финиш турнира).
// Источник правды — server/data/missions.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';
import { openChest } from './chestService.js';

const FILE = 'missions.json';
const DAY_MS = 24 * 60 * 60 * 1000;

// hands — сыгранных раздач за неделю; rake — уплаченного рейка (центы, та же величина, что
// определяет VIP-тир); tournaments — сыгранных турниров (засчитывается на финише турнира).
export type MissionCondition = 'hands' | 'rake' | 'tournaments';

export interface MissionDef {
  id: string;
  title: string; // свободный текст админа (как AchievementDef.title — не i18n-ключ)
  condition: MissionCondition;
  threshold: number;
  rewardAmount: number; // HUB-коины (используется, если сундук не задан или выключен)
  chestId?: string;     // выдать сундук вместо фиксированной суммы (ROADMAP §10.21.7)
}

export interface MissionCounters {
  hands: number;
  rake: number;
  tournaments: number;
}

export interface MissionsState {
  enabled: boolean;
  catalog: MissionDef[];
  periodStart: number; // начало текущей недели (понедельник 00:00 UTC)
  progress: Record<string, MissionCounters>; // userId → счётчики ТЕКУЩЕЙ недели
  claimed: Record<string, string[]>;         // userId → id миссий, забранных на ЭТОЙ неделе
}

export interface MissionView extends MissionDef {
  progress: number;
  earned: boolean;
  claimed: boolean;
}

const DEFAULT_CATALOG: MissionDef[] = [
  { id: 'weekly-50-hands', title: '50 раздач за неделю', condition: 'hands', threshold: 50, rewardAmount: 15 },
  { id: 'weekly-200-hands', title: '200 раздач за неделю', condition: 'hands', threshold: 200, rewardAmount: 40 },
  { id: 'weekly-rake', title: 'Рейк за неделю', condition: 'rake', threshold: 1_000, rewardAmount: 30 },
  { id: 'weekly-3-tournaments', title: '3 турнира за неделю', condition: 'tournaments', threshold: 3, rewardAmount: 25 },
];

export function emptyCounters(): MissionCounters {
  return { hands: 0, rake: 0, tournaments: 0 };
}

// === Чистая часть (тестируется без файловой системы) ===

// Начало недели — понедельник 00:00 UTC. Общий период для всех игроков (решение 2026-09-06):
// у миссий один дедлайн на всех, как у гонок §10.21.4.
export function weekStart(now: number): number {
  const d = new Date(now);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // getUTCDay: 0 — воскресенье
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysSinceMonday * DAY_MS;
}

// Сдвиг периода: наступила новая неделя — прогресс и забранные обнуляются. Каталог и тоггл живут
// дальше. Возвращает исходный объект, если период тот же (дешёвая проверка на каждом обращении).
export function rollPeriod(state: MissionsState, now: number): MissionsState {
  const start = weekStart(now);
  if (state.periodStart === start) return state;
  return { ...state, periodStart: start, progress: {}, claimed: {} };
}

export function addCounters(base: MissionCounters, delta: Partial<MissionCounters>): MissionCounters {
  return {
    hands: base.hands + (delta.hands ?? 0),
    rake: base.rake + (delta.rake ?? 0),
    tournaments: base.tournaments + (delta.tournaments ?? 0),
  };
}

export function computeMissions(
  catalog: MissionDef[],
  counters: MissionCounters,
  claimedIds: string[],
): MissionView[] {
  const claimedSet = new Set(claimedIds);
  return catalog.map((m) => {
    const progress = counters[m.condition];
    return { ...m, progress, earned: progress >= m.threshold, claimed: claimedSet.has(m.id) };
  });
}

// === Санитизация и файловые обёртки ===

const CONDITIONS: readonly MissionCondition[] = ['hands', 'rake', 'tournaments'];
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeDef(raw: unknown): MissionDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MissionDef>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Миссия',
    condition: CONDITIONS.includes(r.condition as MissionCondition) ? (r.condition as MissionCondition) : 'hands',
    threshold: Math.max(0, num(r.threshold, 0)),
    rewardAmount: Math.max(0, num(r.rewardAmount, 0)),
    ...(typeof r.chestId === 'string' && r.chestId.trim() ? { chestId: r.chestId.trim() } : {}),
  };
}

function sanitizeCatalog(v: unknown): MissionDef[] {
  if (!Array.isArray(v)) return [];
  const out: MissionDef[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const d = sanitizeDef(raw);
    if (d && !seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

function sanitizeProgress(v: unknown): Record<string, MissionCounters> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, MissionCounters> = {};
  for (const [userId, raw] of Object.entries(v as Record<string, Partial<MissionCounters>>)) {
    out[userId] = {
      hands: num(raw?.hands, 0),
      rake: num(raw?.rake, 0),
      tournaments: num(raw?.tournaments, 0),
    };
  }
  return out;
}

function sanitizeClaimed(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [userId, ids] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(ids)) out[userId] = ids.filter((id): id is string => typeof id === 'string');
  }
  return out;
}

function defaults(): MissionsState {
  return {
    enabled: false,
    catalog: DEFAULT_CATALOG.map((m) => ({ ...m })),
    periodStart: weekStart(Date.now()),
    progress: {},
    claimed: {},
  };
}

function load(): MissionsState {
  try {
    const s = readJSON(FILE) as Partial<MissionsState>;
    const d = defaults();
    const catalog = sanitizeCatalog(s.catalog);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      catalog: catalog.length ? catalog : d.catalog,
      periodStart: num(s.periodStart, d.periodStart),
      progress: sanitizeProgress(s.progress),
      claimed: sanitizeClaimed(s.claimed),
    };
  } catch {
    return defaults();
  }
}

function save(s: MissionsState): void {
  writeJSON(FILE, s);
}

export function getMissionsCatalog(): { enabled: boolean; catalog: MissionDef[] } {
  const s = load();
  return { enabled: s.enabled, catalog: s.catalog };
}

export function updateMissionsSettings(
  patch: Partial<{ enabled: boolean; catalog: MissionDef[] }>,
): { enabled: boolean; catalog: MissionDef[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.catalog)) {
    const sanitized = sanitizeCatalog(patch.catalog);
    if (sanitized.length) s.catalog = sanitized;
  }
  save(s);
  return { enabled: s.enabled, catalog: s.catalog };
}

// Инкремент счётчиков. Батчем — на одну раздачу приходит сразу несколько игроков, а запись файла
// одна (read-modify-write не должен чередоваться между игроками одного стола).
// Выключенная фича не копит ничего: включат — неделя начнётся с текущего момента.
export function addProgress(entries: ({ userId: string } & Partial<MissionCounters>)[]): void {
  if (entries.length === 0) return;
  const loaded = load();
  if (!loaded.enabled) return;
  const s = rollPeriod(loaded, Date.now());
  let touched = false;
  for (const e of entries) {
    const delta = { hands: e.hands, rake: e.rake, tournaments: e.tournaments };
    if (!delta.hands && !delta.rake && !delta.tournaments) continue;
    s.progress[e.userId] = addCounters(s.progress[e.userId] ?? emptyCounters(), delta);
    touched = true;
  }
  // Смена недели — тоже повод записать: иначе сброшенный период не доживёт до перезапуска.
  if (touched || s !== loaded) save(s);
}

export interface UserMissions {
  enabled: boolean;
  periodStart: number;
  periodEnd: number;
  missions: MissionView[];
}

export function getUserMissions(userId: string): UserMissions {
  const s = rollPeriod(load(), Date.now());
  return {
    enabled: s.enabled,
    periodStart: s.periodStart,
    periodEnd: s.periodStart + 7 * DAY_MS,
    missions: s.enabled ? computeMissions(s.catalog, s.progress[userId] ?? emptyCounters(), s.claimed[userId] ?? []) : [],
  };
}

// Забрать награду. Как и у достижений (§0.13) — решает сервер по СВЕЖЕМУ прогрессу, клиент
// подделать клейм не может. Повторно на той же неделе не выдаётся, на следующей — снова доступна.
export function claimMission(
  userId: string,
  missionId: string,
): { reward: number; chestTitle?: string } | { error: 'disabled' | 'not-found' | 'not-earned' | 'already-claimed' } {
  const s = rollPeriod(load(), Date.now());
  if (!s.enabled) return { error: 'disabled' };
  const def = s.catalog.find((m) => m.id === missionId);
  if (!def) return { error: 'not-found' };
  const claimedIds = s.claimed[userId] ?? [];
  if (claimedIds.includes(missionId)) return { error: 'already-claimed' };
  const counters = s.progress[userId] ?? emptyCounters();
  if (counters[def.condition] < def.threshold) return { error: 'not-earned' };
  s.claimed[userId] = [...claimedIds, missionId];
  save(s);
  // Сундук (если задан и включён) решает сумму на сервере — клиент получает готовый результат.
  // Сундуки выключены или удалены — платим фиксированную награду, как раньше.
  const chest = def.chestId ? openChest(def.chestId) : null;
  return chest ? { reward: chest.amount, chestTitle: chest.title } : { reward: def.rewardAmount };
}

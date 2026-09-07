// Достижения — одноразовые вехи с наградой в HUB-коинах (ROADMAP §10.21.3). Прогресс считается
// НА ЛЕТУ при каждом запросе (compute-on-read) из уже существующих источников данных — БЕЗ хука
// в GameManager.cleanupHand (осознанно, §0.2/§0.11 — не трогаем игровой хот-путь). Здесь хранится
// только сам каталог (admin-редактируемый) и факт «уже забрал» (per-user, чтобы не выдать дважды).
// Источник правды — server/data/achievements.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';
import { openChest } from './chestService.js';

const FILE = 'achievements.json';

// hands/tournamentsPlayed/tournamentWins — из статистики раздач/турниров; lifetimeRake — из
// рейкбэка (реальный рейк, НЕ HUB-коины — просто ещё одна измеримая величина, как остальные).
export type AchievementCondition = 'hands' | 'tournamentsPlayed' | 'tournamentWins' | 'lifetimeRake';

export interface AchievementDef {
  id: string;
  title: string; // свободный текст, задаёт админ (как RakebackTier.name — не i18n-ключ)
  condition: AchievementCondition;
  threshold: number;
  rewardAmount: number; // HUB-коины (используется, если сундук не задан или выключен)
  chestId?: string;     // выдать сундук вместо фиксированной суммы (ROADMAP §10.21.7)
}

interface AchievementsState {
  enabled: boolean;
  catalog: AchievementDef[];
  claimed: Record<string, string[]>; // userId → [achievementId], уже забранные награды
}

const DEFAULT_CATALOG: AchievementDef[] = [
  { id: 'first-hand', title: 'Первая раздача', condition: 'hands', threshold: 1, rewardAmount: 5 },
  { id: '100-hands', title: '100 рук', condition: 'hands', threshold: 100, rewardAmount: 20 },
  { id: 'tournament-win', title: 'Победа в турнире', condition: 'tournamentWins', threshold: 1, rewardAmount: 30 },
  { id: '1000-hands', title: '1000 рук', condition: 'hands', threshold: 1000, rewardAmount: 50 },
  { id: 'vip-platinum', title: 'VIP Platinum', condition: 'lifetimeRake', threshold: 50_000, rewardAmount: 100 },
  { id: '10-tournaments', title: '10 турниров', condition: 'tournamentsPlayed', threshold: 10, rewardAmount: 40 },
];

function defaults(): AchievementsState {
  return { enabled: false, catalog: DEFAULT_CATALOG.map((a) => ({ ...a })), claimed: {} };
}

const CONDITIONS: readonly AchievementCondition[] = ['hands', 'tournamentsPlayed', 'tournamentWins', 'lifetimeRake'];
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeDef(raw: unknown): AchievementDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AchievementDef>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Достижение',
    condition: CONDITIONS.includes(r.condition as AchievementCondition) ? (r.condition as AchievementCondition) : 'hands',
    threshold: Math.max(0, num(r.threshold, 0)),
    rewardAmount: Math.max(0, num(r.rewardAmount, 0)),
    ...(typeof r.chestId === 'string' && r.chestId.trim() ? { chestId: r.chestId.trim() } : {}),
  };
}

function sanitizeCatalog(v: unknown): AchievementDef[] {
  if (!Array.isArray(v)) return [];
  const out: AchievementDef[] = [];
  const seenIds = new Set<string>();
  for (const raw of v) {
    const d = sanitizeDef(raw);
    if (d && !seenIds.has(d.id)) {
      seenIds.add(d.id);
      out.push(d);
    }
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

function load(): AchievementsState {
  try {
    const s = readJSON(FILE) as Partial<AchievementsState>;
    const d = defaults();
    const catalog = sanitizeCatalog(s.catalog);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      catalog: catalog.length ? catalog : d.catalog,
      claimed: sanitizeClaimed(s.claimed),
    };
  } catch {
    return defaults();
  }
}

function save(s: AchievementsState): void {
  writeJSON(FILE, s);
}

export function getAchievementsCatalog(): { enabled: boolean; catalog: AchievementDef[] } {
  const s = load();
  return { enabled: s.enabled, catalog: s.catalog };
}

export function updateAchievementsSettings(
  patch: Partial<{ enabled: boolean; catalog: AchievementDef[] }>,
): { enabled: boolean; catalog: AchievementDef[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.catalog)) {
    const sanitized = sanitizeCatalog(patch.catalog);
    if (sanitized.length) s.catalog = sanitized;
  }
  save(s);
  return { enabled: s.enabled, catalog: s.catalog };
}

export interface AchievementProgress {
  hands: number;
  tournamentsPlayed: number;
  tournamentWins: number;
  lifetimeRake: number;
}

export interface AchievementView extends AchievementDef {
  earned: boolean;
  claimed: boolean;
}

// Чистая функция — earned/claimed по каталогу и текущему прогрессу. Вызывающий сам достаёт
// progress из существующих источников (statsService/rakebackService/tournamentManager.list()).
export function computeAchievements(
  catalog: AchievementDef[],
  claimedIds: string[],
  progress: AchievementProgress,
): AchievementView[] {
  const claimedSet = new Set(claimedIds);
  return catalog.map((a) => ({
    ...a,
    earned: progress[a.condition] >= a.threshold,
    claimed: claimedSet.has(a.id),
  }));
}

export function getClaimedIds(userId: string): string[] {
  return load().claimed[userId] ?? [];
}

// Забрать награду — проверяет earned+not-claimed по СВЕЖЕМУ прогрессу (защита от подделки на
// клиенте, §0.13 — сервер решает). null-эквиваленты через discriminated union ошибок.
export function claimAchievement(
  userId: string,
  achievementId: string,
  progress: AchievementProgress,
): { reward: number; chestTitle?: string } | { error: 'not-found' | 'not-earned' | 'already-claimed' } {
  const s = load();
  const def = s.catalog.find((a) => a.id === achievementId);
  if (!def) return { error: 'not-found' };
  const claimedIds = s.claimed[userId] ?? [];
  if (claimedIds.includes(achievementId)) return { error: 'already-claimed' };
  if (progress[def.condition] < def.threshold) return { error: 'not-earned' };
  s.claimed[userId] = [...claimedIds, achievementId];
  save(s);
  // См. claimMission: сундук решает сумму на сервере, иначе платим фиксированную награду.
  const chest = def.chestId ? openChest(def.chestId) : null;
  return chest ? { reward: chest.amount, chestTitle: chest.title } : { reward: def.rewardAmount };
}

// Визит-бонус / стрик ежедневного входа — HUB-коины за календарные дни подряд со входом
// (ROADMAP §10.21.2). Прогресс серии конкретного игрока (lastLoginDate/streakDays) хранится
// на User (users.json, auth.ts) — это per-аккаунт состояние, как avatarSeed/dateOfBirth. Здесь —
// только настраиваемая админом таблица наград + чистая логика продолжения серии + анти-фарм
// сеть устройств/IP (переиспользует antiCollusion.ts, решение пользователя 2026-08-30).
// Источник правды — server/data/streak.json (атомарно через writeJSON, §0.4). Файл в data/,
// nodemon не watch'ит (§0.3) — записи не рестартят сервер.
import { readJSON, writeJSON } from '../auth/storage.js';
import { hasNetworkCollision, type NetworkInfo } from './antiCollusion.js';

const FILE = 'streak.json';
const NETWORK_CAP = 1000;

export interface StreakReward {
  day: number;    // 1..N, после последнего дня таблица зацикливается
  amount: number; // HUB-коины
}

interface ClaimedNetwork extends NetworkInfo {
  userId: string;
  t: number;
}

interface StreakState {
  enabled: boolean;
  rewards: StreakReward[];
  claimedNetworks: ClaimedNetwork[]; // анти-фарм: кто уже получал day-1 с этого ip/deviceId
}

const DEFAULT_REWARDS: StreakReward[] = [
  { day: 1, amount: 10 },
  { day: 2, amount: 15 },
  { day: 3, amount: 20 },
  { day: 4, amount: 30 },
  { day: 5, amount: 40 },
  { day: 6, amount: 60 },
  { day: 7, amount: 100 },
];

function defaults(): StreakState {
  return { enabled: false, rewards: DEFAULT_REWARDS.map((r) => ({ ...r })), claimedNetworks: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeReward(r: unknown): StreakReward | null {
  if (!r || typeof r !== 'object') return null;
  const raw = r as Partial<StreakReward>;
  const day = Math.round(num(raw.day, NaN));
  if (!Number.isFinite(day) || day < 1) return null;
  return { day, amount: Math.max(0, num(raw.amount, 0)) };
}

function sanitizeRewards(v: unknown): StreakReward[] {
  if (!Array.isArray(v)) return [];
  const out: StreakReward[] = [];
  for (const raw of v) {
    const r = sanitizeReward(raw);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.day - b.day);
}

function sanitizeNetworks(v: unknown): ClaimedNetwork[] {
  if (!Array.isArray(v)) return [];
  const out: ClaimedNetwork[] = [];
  for (const raw of v as Partial<ClaimedNetwork>[]) {
    if (!raw || typeof raw.userId !== 'string') continue;
    out.push({
      userId: raw.userId,
      ip: typeof raw.ip === 'string' ? raw.ip : '',
      deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
      t: num(raw.t, Date.now()),
    });
  }
  return out.slice(-NETWORK_CAP);
}

function load(): StreakState {
  try {
    const s = readJSON(FILE) as Partial<StreakState>;
    const d = defaults();
    const rewards = sanitizeRewards(s.rewards);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      rewards: rewards.length ? rewards : d.rewards,
      claimedNetworks: sanitizeNetworks(s.claimedNetworks),
    };
  } catch {
    return defaults();
  }
}

function save(s: StreakState): void {
  writeJSON(FILE, s);
}

// Публичная/личная таблица наград (без анти-фарм сети — те не светим никому, кроме кода сервера).
export function getStreakConfig(): { enabled: boolean; rewards: StreakReward[] } {
  const s = load();
  return { enabled: s.enabled, rewards: s.rewards };
}

// Обновление конфига админом (toggle + таблица наград).
export function updateStreakSettings(
  patch: Partial<{ enabled: boolean; rewards: StreakReward[] }>,
): { enabled: boolean; rewards: StreakReward[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.rewards) && patch.rewards.length) {
    const sanitized = sanitizeRewards(patch.rewards);
    if (sanitized.length) s.rewards = sanitized;
  }
  save(s);
  return { enabled: s.enabled, rewards: s.rewards };
}

// Разница в календарных днях (UTC, без времени) между двумя датами 'YYYY-MM-DD'.
function daysBetween(a: string, b: string): number {
  const da = Date.parse(a + 'T00:00:00.000Z');
  const db = Date.parse(b + 'T00:00:00.000Z');
  return Math.round((db - da) / 86_400_000);
}

// Продолжение серии — чистая функция. isNewDay=false — сегодня уже засчитано, повторно не начислять.
export function computeNextStreak(
  lastLoginDate: string | undefined,
  currentStreakDays: number,
  todayDate: string,
): { streakDays: number; isNewDay: boolean } {
  if (lastLoginDate === todayDate) return { streakDays: currentStreakDays, isNewDay: false };
  if (lastLoginDate && daysBetween(lastLoginDate, todayDate) === 1) {
    return { streakDays: currentStreakDays + 1, isNewDay: true };
  }
  return { streakDays: 1, isNewDay: true }; // первый вход или пропуск ≥1 дня — серия сбрасывается
}

// Награда за конкретный день серии — чистая функция, таблица зацикливается после последнего дня.
export function rewardForDay(rewards: StreakReward[], day: number): number {
  if (rewards.length === 0 || day < 1) return 0;
  return rewards[(day - 1) % rewards.length].amount;
}

// Анти-фарм: это ip/deviceId уже получал(о) day-1 награду для ДРУГОГО userId? Переиспользует
// пример hasNetworkCollision (§10.6 anti-collusion), но исключает собственные прошлые заходы
// того же userId — иначе легитимный возврат после паузы блокировал бы сам себя.
function isDay1NetworkBlocked(s: StreakState, userId: string, network: NetworkInfo): boolean {
  const others = s.claimedNetworks.filter((c) => c.userId !== userId);
  return hasNetworkCollision(others, network);
}

export interface LoginStreakResult {
  streakDays: number;
  reward: number;  // 0, если сегодня не новый день ИЛИ анти-фарм заблокировал выплату
  blocked: boolean; // true — day-1 награда не выплачена из-за коллизии по ip/deviceId
}

// Обработать вход игрока: посчитать серию, награду, применить анти-фарм на day-1. Вызывающий
// (auth.ts) сохраняет streakDays/lastLoginDate НА СВОЁМ User-объекте — здесь только конфиг+сеть.
// null — фича выключена (серию не считаем вообще).
export function processLogin(
  userId: string,
  lastLoginDate: string | undefined,
  currentStreakDays: number,
  network: NetworkInfo,
  now: Date = new Date(),
): LoginStreakResult | null {
  const s = load();
  if (!s.enabled) return null;

  const todayDate = now.toISOString().slice(0, 10);
  const { streakDays, isNewDay } = computeNextStreak(lastLoginDate, currentStreakDays, todayDate);
  if (!isNewDay) return { streakDays, reward: 0, blocked: false };

  const rawReward = rewardForDay(s.rewards, streakDays);
  if (rawReward <= 0) return { streakDays, reward: 0, blocked: false };

  const isDay1 = streakDays === 1;
  const blocked = isDay1 && isDay1NetworkBlocked(s, userId, network);
  if (isDay1) {
    s.claimedNetworks = [...s.claimedNetworks, { ...network, userId, t: now.getTime() }].slice(-NETWORK_CAP);
    save(s);
  }
  return { streakDays, reward: blocked ? 0 : rawReward, blocked };
}

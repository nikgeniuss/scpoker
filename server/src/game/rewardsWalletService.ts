// Кошелёк HUB-коинов — отдельная НЕВЫВОДИМАЯ валюта наград (рейкбэк/стрик/миссии/гонки/
// рефералка/магазин, ROADMAP §10.21). Принципиально ОТДЕЛЬНО от bankrollService/chips
// (реальные, выводимые в USDT) — не смешивать файлы/точки записи, обратной конвертации
// в реальные чипсы нет ни для одной причины начисления.
// Источник правды — server/data/rewards-wallet.json (атомарно через writeJSON, §0.4). Файл в
// data/, nodemon не watch'ит (§0.3) — записи не рестартят сервер.
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'rewards-wallet.json';
const HISTORY_CAP = 200;

export type RewardsLedgerReason = 'rakeback' | 'streak' | 'mission' | 'race' | 'referral' | 'shop' | 'chest' | 'bonus';

const REASONS: readonly RewardsLedgerReason[] = ['rakeback', 'streak', 'mission', 'race', 'referral', 'shop', 'chest', 'bonus'];

export interface RewardsLedgerEntry {
  t: number;
  userId: string;
  delta: number; // положительное — начисление, отрицательное — списание
  reason: RewardsLedgerReason;
  meta?: string;
}

export interface RewardsWalletUserState {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface RewardsWalletState {
  users: Record<string, RewardsWalletUserState>;
  history: RewardsLedgerEntry[];
}

function defaults(): RewardsWalletState {
  return { users: {}, history: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function sanitizeUserState(raw: Partial<RewardsWalletUserState> | undefined): RewardsWalletUserState {
  return {
    balance: Math.max(0, num(raw?.balance, 0)),
    totalEarned: Math.max(0, num(raw?.totalEarned, 0)),
    totalSpent: Math.max(0, num(raw?.totalSpent, 0)),
  };
}

function sanitizeUsers(v: unknown): Record<string, RewardsWalletUserState> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, RewardsWalletUserState> = {};
  for (const [id, raw] of Object.entries(v as Record<string, Partial<RewardsWalletUserState>>)) {
    out[id] = sanitizeUserState(raw);
  }
  return out;
}

function sanitizeHistory(v: unknown): RewardsLedgerEntry[] {
  if (!Array.isArray(v)) return [];
  const out: RewardsLedgerEntry[] = [];
  for (const raw of v as Partial<RewardsLedgerEntry>[]) {
    if (!raw || typeof raw.userId !== 'string') continue;
    out.push({
      t: num(raw.t, Date.now()),
      userId: raw.userId,
      delta: num(raw.delta, 0),
      reason: REASONS.includes(raw.reason as RewardsLedgerReason) ? (raw.reason as RewardsLedgerReason) : 'mission',
      meta: typeof raw.meta === 'string' ? raw.meta : undefined,
    });
  }
  return out.slice(0, HISTORY_CAP);
}

function load(): RewardsWalletState {
  try {
    const s = readJSON(FILE) as Partial<RewardsWalletState>;
    return { users: sanitizeUsers(s.users), history: sanitizeHistory(s.history) };
  } catch {
    return defaults();
  }
}

function save(s: RewardsWalletState): void {
  writeJSON(FILE, s);
}

function pushHistory(s: RewardsWalletState, entry: RewardsLedgerEntry): void {
  s.history = [entry, ...s.history].slice(0, HISTORY_CAP);
}

// Баланс HUB-коинов игрока.
export function getBalance(userId: string): number {
  return load().users[userId]?.balance ?? 0;
}

// Начислить HUB-коины (amount<=0 — no-op, возвращает текущий баланс без записи в историю).
export function credit(userId: string, amount: number, reason: RewardsLedgerReason, meta?: string): number {
  const s = load();
  const u = s.users[userId] ?? sanitizeUserState(undefined);
  if (amount <= 0) return u.balance;
  u.balance += amount;
  u.totalEarned += amount;
  s.users[userId] = u;
  pushHistory(s, { t: Date.now(), userId, delta: amount, reason, meta });
  save(s);
  return u.balance;
}

// Списать HUB-коины (магазин лояльности). null — недостаточно средств (ничего не меняет).
export function debit(userId: string, amount: number, reason: RewardsLedgerReason, meta?: string): number | null {
  if (amount <= 0) return getBalance(userId);
  const s = load();
  const u = s.users[userId] ?? sanitizeUserState(undefined);
  if (u.balance < amount) return null;
  u.balance -= amount;
  u.totalSpent += amount;
  s.users[userId] = u;
  pushHistory(s, { t: Date.now(), userId, delta: -amount, reason, meta });
  save(s);
  return u.balance;
}

// Личная история начислений/списаний (только свои записи, последние limit).
export function getHistory(userId: string, limit = 50): RewardsLedgerEntry[] {
  return load().history.filter((h) => h.userId === userId).slice(0, limit);
}

// Личный кабинет — баланс + свежая история одним вызовом.
export function getUserWalletInfo(userId: string): { balance: number; totalEarned: number; totalSpent: number; history: RewardsLedgerEntry[] } {
  const s = load();
  const u = s.users[userId] ?? sanitizeUserState(undefined);
  return { ...u, history: s.history.filter((h) => h.userId === userId).slice(0, 50) };
}

// Полное состояние (для админки — сводка по кругу обращения HUB-коинов).
export function getWalletState(): RewardsWalletState {
  return load();
}

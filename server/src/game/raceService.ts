// Лидерборд-гонки с реальным призовым фондом (ROADMAP §10.21.4) — периодическая гонка поверх
// уже существующего публичного рейтинга (Leaderboard.tsx/GET /api/leaderboard, §10.5). По
// истечении periodDays — топ-N по выбранной метрике получают HUB-коины, период открывается заново.
// Метрика по умолчанию — hands/pnl (уже проверенные данные statsService). «По рейку» сознательно
// НЕ добавлена в MVP — см. обоснование в ROADMAP §10.21.4.
// Источник правды — server/data/race.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';
import { aggregateAllUsersInPeriod } from './statsService.js';
import { credit as creditRewardsWallet } from './rewardsWalletService.js';
import { sendNotification } from './inboxService.js';

const FILE = 'race.json';
const HISTORY_CAP = 50;

export type RaceMetric = 'hands' | 'pnl';

export interface RacePrizeRow {
  place: number;
  amount: number; // HUB-коины
}

export interface RaceWinner {
  userId: string;
  username: string;
  place: number;
  score: number;
  prize: number;
}

export interface RaceHistoryEntry {
  periodStart: number;
  periodEnd: number;
  metric: RaceMetric;
  winners: RaceWinner[];
}

interface RaceState {
  enabled: boolean;
  metric: RaceMetric;
  periodDays: number;
  prizeTable: RacePrizeRow[];
  periodStart: number; // epoch ms — старт текущего периода
  history: RaceHistoryEntry[];
}

const DEFAULT_PRIZE_TABLE: RacePrizeRow[] = [
  { place: 1, amount: 500 },
  { place: 2, amount: 300 },
  { place: 3, amount: 150 },
];

function defaults(): RaceState {
  return {
    enabled: false,
    metric: 'hands',
    periodDays: 7,
    prizeTable: DEFAULT_PRIZE_TABLE.map((r) => ({ ...r })),
    periodStart: Date.now(),
    history: [],
  };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const METRICS: readonly RaceMetric[] = ['hands', 'pnl'];

function sanitizePrizeRow(raw: unknown): RacePrizeRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RacePrizeRow>;
  const place = Math.round(num(r.place, NaN));
  if (!Number.isFinite(place) || place < 1) return null;
  return { place, amount: Math.max(0, num(r.amount, 0)) };
}

function sanitizePrizeTable(v: unknown): RacePrizeRow[] {
  if (!Array.isArray(v)) return [];
  const out: RacePrizeRow[] = [];
  for (const raw of v) {
    const r = sanitizePrizeRow(raw);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.place - b.place);
}

function sanitizeHistory(v: unknown): RaceHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return (v as RaceHistoryEntry[]).slice(0, HISTORY_CAP);
}

function load(): RaceState {
  try {
    const s = readJSON(FILE) as Partial<RaceState>;
    const d = defaults();
    const prizeTable = sanitizePrizeTable(s.prizeTable);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      metric: METRICS.includes(s.metric as RaceMetric) ? (s.metric as RaceMetric) : d.metric,
      periodDays: Math.max(1, num(s.periodDays, d.periodDays)),
      prizeTable: prizeTable.length ? prizeTable : d.prizeTable,
      periodStart: num(s.periodStart, d.periodStart),
      history: sanitizeHistory(s.history),
    };
  } catch {
    return defaults();
  }
}

function save(s: RaceState): void {
  writeJSON(FILE, s);
}

export function getRaceConfig(): Omit<RaceState, 'history'> {
  const { history: _history, ...rest } = load();
  return rest;
}

export function getRacePublic(): Omit<RaceState, 'history'> & { history: RaceHistoryEntry[] } {
  return load();
}

export function updateRaceSettings(
  patch: Partial<{ enabled: boolean; metric: RaceMetric; periodDays: number; prizeTable: RacePrizeRow[] }>,
): Omit<RaceState, 'history'> {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (METRICS.includes(patch.metric as RaceMetric)) s.metric = patch.metric as RaceMetric;
  if (typeof patch.periodDays === 'number' && patch.periodDays >= 1) s.periodDays = Math.round(patch.periodDays);
  if (Array.isArray(patch.prizeTable) && patch.prizeTable.length) {
    const sanitized = sanitizePrizeTable(patch.prizeTable);
    if (sanitized.length) s.prizeTable = sanitized;
  }
  save(s);
  const { history: _history, ...rest } = s;
  return rest;
}

export function isPeriodElapsed(periodStart: number, periodDays: number, now: number): boolean {
  return now - periodStart >= periodDays * 86_400_000;
}

export interface ScoreEntry {
  userId: string;
  username: string;
  score: number;
}

// Топ-N по очкам ≥ уверенно положительному значению (0 не участвует — нулевая активность/PnL не
// награждается) в порядке призовой таблицы. Мест больше участников — недостающие места пропускаются.
export function computeRaceWinners(scores: ScoreEntry[], prizeTable: RacePrizeRow[]): RaceWinner[] {
  const ranked = scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const winners: RaceWinner[] = [];
  for (const row of [...prizeTable].sort((a, b) => a.place - b.place)) {
    const entry = ranked[row.place - 1];
    if (!entry) continue;
    winners.push({ userId: entry.userId, username: entry.username, place: row.place, score: entry.score, prize: row.amount });
  }
  return winners;
}

// Если период истёк — закрывает его (считает победителей, начисляет призы, открывает новый
// период), иначе no-op. Вызывается периодически из index.ts (см. start()). Возвращает закрытую
// запись истории или null (фича выключена / период ещё не истёк).
export function checkAndCloseRace(now: number = Date.now()): RaceHistoryEntry | null {
  const s = load();
  if (!s.enabled) return null;
  if (!isPeriodElapsed(s.periodStart, s.periodDays, now)) return null;

  const stats = aggregateAllUsersInPeriod(s.periodStart, now);
  const users = readJSON('users.json') as { id: string; username: string; banned?: boolean }[];
  const byId = new Map(users.map((u) => [u.id, u]));
  const scores: ScoreEntry[] = Object.entries(stats)
    .map(([userId, st]) => {
      const u = byId.get(userId);
      if (!u || u.banned) return null;
      return { userId, username: u.username, score: s.metric === 'hands' ? st.hands : st.pnl };
    })
    .filter((e): e is ScoreEntry => e !== null);

  const winners = computeRaceWinners(scores, s.prizeTable);
  for (const w of winners) {
    creditRewardsWallet(w.userId, w.prize, 'race');
    sendNotification(w.userId, 'reward', `Гонка лидеров: ${w.place}-е место, +${w.prize} HUB`);
  }

  const entry: RaceHistoryEntry = { periodStart: s.periodStart, periodEnd: now, metric: s.metric, winners };
  s.history = [entry, ...s.history].slice(0, HISTORY_CAP);
  s.periodStart = now;
  save(s);
  return entry;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function start(intervalMs: number): void {
  stop();
  timer = setInterval(() => {
    try {
      checkAndCloseRace();
    } catch (err) {
      console.error('⚠️ [race] checkAndCloseRace тик упал:', err);
    }
  }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

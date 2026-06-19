// Трекинг статистики игроков-людей по раздачам (ROADMAP §10.10 «Фаза 3»).
// Append-лог результатов в hands.json + агрегация за период. Запись идёт синхронно
// из GameManager.cleanupHand через инжектируемый колбэк (см. statsRecorder) — тесты
// колбэк не выставляют, поэтому при прогоне тестов файл не пишется.
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'hands.json';

// Одна запись = результат одного игрока-человека за одну раздачу.
export interface HandStatRecord {
  t: number;       // epoch ms завершения раздачи
  roomId: string;
  userId: string;
  delta: number;   // изменение стека за раздачу (PnL)
  rake: number;    // рейк (пока всегда 0 — комиссии в игре ещё нет)
  format?: 'nlh' | 'shortdeck'; // формат стола; отсутствие = nlh (старые записи)
}

export interface UserStats {
  hands: number;
  pnl: number;
  rake: number;
}

function emptyStats(): UserStats {
  return { hands: 0, pnl: 0, rake: 0 };
}

function readLog(): HandStatRecord[] {
  try {
    const log = readJSON(FILE) as HandStatRecord[];
    return Array.isArray(log) ? log : [];
  } catch {
    return []; // файла ещё нет или повреждён — пустой лог
  }
}

// === Чистые агрегаторы (тестируются без файловой системы) ===

// Сумма по одному юзеру за период [sinceMs, untilMs]. null-граница = без ограничения.
export function aggregateRecords(
  records: HandStatRecord[],
  userId: string,
  sinceMs: number | null,
  untilMs: number | null,
): UserStats {
  const acc = emptyStats();
  for (const r of records) {
    if (r.userId !== userId) continue;
    if (sinceMs !== null && r.t < sinceMs) continue;
    if (untilMs !== null && r.t > untilMs) continue;
    acc.hands++;
    acc.pnl += r.delta;
    acc.rake += r.rake;
  }
  return acc;
}

// Сумма за всё время по всем юзерам (для сортировки/отображения в списке админки).
export function aggregateAllRecords(records: HandStatRecord[]): Record<string, UserStats> {
  return aggregateAllRecordsInPeriod(records, null, null);
}

// Сумма за период по всем юзерам (для публичной таблицы лидеров — ROADMAP §10.5).
// null-граница = без ограничения.
export function aggregateAllRecordsInPeriod(
  records: HandStatRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): Record<string, UserStats> {
  const out: Record<string, UserStats> = {};
  for (const r of records) {
    if (sinceMs !== null && r.t < sinceMs) continue;
    if (untilMs !== null && r.t > untilMs) continue;
    const s = out[r.userId] ?? (out[r.userId] = emptyStats());
    s.hands++;
    s.pnl += r.delta;
    s.rake += r.rake;
  }
  return out;
}

// === Файловые обёртки ===

// Записать результат раздачи. Синхронно (без await) — чтобы read-modify-write не
// чередовался между одновременно завершающимися столами в одном event-loop.
export function recordHandStat(rec: HandStatRecord): void {
  const log = readLog();
  log.push(rec);
  writeJSON(FILE, log);
}

export function aggregateUserStats(userId: string, sinceMs: number | null, untilMs: number | null): UserStats {
  return aggregateRecords(readLog(), userId, sinceMs, untilMs);
}

export function aggregateAllUsers(): Record<string, UserStats> {
  return aggregateAllRecords(readLog());
}

export function aggregateAllUsersInPeriod(sinceMs: number | null, untilMs: number | null): Record<string, UserStats> {
  return aggregateAllRecordsInPeriod(readLog(), sinceMs, untilMs);
}

// Кумулятивный PnL по раздачам для графика банкролла (PokerCraft-lite §10.10).
export function getChartData(userId: string): { t: number; cumPnL: number }[] {
  const mine = readLog().filter(r => r.userId === userId).sort((a, b) => a.t - b.t);
  let cum = 0;
  return mine.map(r => { cum += r.delta; return { t: r.t, cumPnL: cum }; });
}

// === Агрегаторы для админ-вкладки «Данные» (overview + разбивка по столам) ===

export interface OverviewStats {
  games: number;        // число раздач (уникальные roomId+t; одна раздача = N записей игроков)
  pnl: number;          // суммарный PnL игроков-людей за период
  rake: number;         // суммарный рейк за период (пока 0)
  tablesActive: number; // столов, на которых были раздачи с людьми
}

export interface TableStats {
  roomId: string;
  games: number;
  pnl: number;
  rake: number;
}

// Сводка за период [sinceMs, untilMs] (null-граница = без ограничения). Чистая функция.
export function aggregateOverview(
  records: HandStatRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): OverviewStats {
  let pnl = 0;
  let rake = 0;
  const hands = new Set<string>();
  const tables = new Set<string>();
  for (const r of records) {
    if (sinceMs !== null && r.t < sinceMs) continue;
    if (untilMs !== null && r.t > untilMs) continue;
    pnl += r.delta;
    rake += r.rake;
    hands.add(r.roomId + '#' + r.t);
    tables.add(r.roomId);
  }
  return { games: hands.size, pnl, rake, tablesActive: tables.size };
}

// Разбивка по столам за период — для дроилдауна. Сортировка по числу раздач (убыв.).
export function aggregateTables(
  records: HandStatRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): TableStats[] {
  const byRoom = new Map<string, { games: Set<number>; pnl: number; rake: number }>();
  for (const r of records) {
    if (sinceMs !== null && r.t < sinceMs) continue;
    if (untilMs !== null && r.t > untilMs) continue;
    let e = byRoom.get(r.roomId);
    if (!e) {
      e = { games: new Set<number>(), pnl: 0, rake: 0 };
      byRoom.set(r.roomId, e);
    }
    e.games.add(r.t);
    e.pnl += r.delta;
    e.rake += r.rake;
  }
  return Array.from(byRoom.entries())
    .map(([roomId, e]) => ({ roomId, games: e.games.size, pnl: e.pnl, rake: e.rake }))
    .sort((a, b) => b.games - a.games);
}

// Разбивка overview по форматам (NLH и Short Deck). Чистая функция.
export function aggregateByFormat(
  records: HandStatRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): { nlh: OverviewStats; shortdeck: OverviewStats } {
  type Acc = { pnl: number; rake: number; hands: Set<string>; tables: Set<string> };
  const mk = (): Acc => ({ pnl: 0, rake: 0, hands: new Set(), tables: new Set() });
  const acc: Record<'nlh' | 'shortdeck', Acc> = { nlh: mk(), shortdeck: mk() };
  for (const r of records) {
    if (sinceMs !== null && r.t < sinceMs) continue;
    if (untilMs !== null && r.t > untilMs) continue;
    const fmt: 'nlh' | 'shortdeck' = r.format === 'shortdeck' ? 'shortdeck' : 'nlh';
    acc[fmt].pnl += r.delta;
    acc[fmt].rake += r.rake;
    acc[fmt].hands.add(r.roomId + '#' + r.t);
    acc[fmt].tables.add(r.roomId);
  }
  const toStats = (a: Acc): OverviewStats => ({
    games: a.hands.size, pnl: a.pnl, rake: a.rake, tablesActive: a.tables.size,
  });
  return { nlh: toStats(acc.nlh), shortdeck: toStats(acc.shortdeck) };
}

export function overviewStats(sinceMs: number | null, untilMs: number | null): OverviewStats {
  return aggregateOverview(readLog(), sinceMs, untilMs);
}

export function tableStats(sinceMs: number | null, untilMs: number | null): TableStats[] {
  return aggregateTables(readLog(), sinceMs, untilMs);
}

export function formatStats(
  sinceMs: number | null,
  untilMs: number | null,
): { nlh: OverviewStats; shortdeck: OverviewStats } {
  return aggregateByFormat(readLog(), sinceMs, untilMs);
}

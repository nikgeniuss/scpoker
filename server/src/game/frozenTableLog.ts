// Лог восстановлений зависших столов (table watchdog, см. tableWatchdog.ts) — для диагностики,
// какие столы и как часто зависают (это симптом бага в таймер-машине раздачи, не сам фикс).
// Append-лог в frozen-tables.json, по образцу roomEvents.ts. Тесты не выставляют
// frozenTableRecorder → файл не пишется.
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'frozen-tables.json';

export interface FrozenTableRecord {
  t: number;         // epoch ms восстановления
  roomId: string;
  name: string;       // имя стола на момент восстановления
  phase: string;       // фаза, в которой завис (preflop/flop/turn/river/showdown)
  overdueMs: number;  // на сколько мс был просрочен дедлайн таймера
}

function readLog(): FrozenTableRecord[] {
  try {
    const log = readJSON(FILE) as FrozenTableRecord[];
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

export function recordFrozenTable(rec: FrozenTableRecord): void {
  const log = readLog();
  log.push(rec);
  writeJSON(FILE, log);
}

export function readFrozenTableEvents(): FrozenTableRecord[] {
  return readLog();
}

// Лог открытия столов (для метрики «сколько столов открыто за период» в админ-вкладке «Данные»).
// Append-лог в room-events.json: одна запись = создание одного стола человеком (бот-столы не
// логируем — они системные и пересоздаются при каждом рестарте). Запись идёт синхронно из
// GameManager.createRoom через инжектируемый колбэк (см. roomEventRecorder) — тесты его не
// выставляют, поэтому при прогоне тестов файл не пишется. История накапливается с момента ввода.
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'room-events.json';

export interface RoomEventRecord {
  t: number;        // epoch ms создания стола
  roomId: string;
  name: string;     // имя стола на момент создания (для отображения в дроилдауне)
  createdBy: string;
}

function readEventsLog(): RoomEventRecord[] {
  try {
    const log = readJSON(FILE) as RoomEventRecord[];
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

// === Чистые агрегаторы (тестируются без файловой системы) ===

// Сколько уникальных столов открыто за период [sinceMs, untilMs] (null-граница = без ограничения).
export function countTablesOpened(
  events: RoomEventRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): number {
  const ids = new Set<string>();
  for (const e of events) {
    if (sinceMs !== null && e.t < sinceMs) continue;
    if (untilMs !== null && e.t > untilMs) continue;
    ids.add(e.roomId);
  }
  return ids.size;
}

// Карта roomId → последнее известное имя стола (для подписи в дроилдауне).
export function roomNameMap(events: RoomEventRecord[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of events) out[e.roomId] = e.name; // последнее вхождение перетирает — имя «свежее»
  return out;
}

// === Файловые обёртки ===

export function recordRoomCreated(rec: RoomEventRecord): void {
  const log = readEventsLog();
  log.push(rec);
  writeJSON(FILE, log);
}

export function readRoomEvents(): RoomEventRecord[] {
  return readEventsLog();
}

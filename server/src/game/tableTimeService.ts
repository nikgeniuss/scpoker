// Время игрока за столом (метрика «Часов за столом» в профиле, ROADMAP §9.1).
// Считаем не по событиям выхода (leave/disconnect/bust/kick — любую точку легко пропустить,
// и рестарт сервера теряет незакрытую сессию), а тиком: раз в минуту всем, кто сейчас сидит,
// начисляется минута. Устойчиво к любым сценариям выхода и к рестарту — потеряется максимум
// одна минута. Источник правды — server/data/tableTime.json (атомарно, §0.3).
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'tableTime.json';

// userId → накопленные минуты за столом (за всё время).
export type TableTimeState = Record<string, number>;

// === Чистая часть (тестируется без файловой системы) ===

// Начислить minutes каждому из userIds. Возвращает НОВЫЙ объект — исходный не мутируется.
export function applyTick(state: TableTimeState, userIds: string[], minutes = 1): TableTimeState {
  const next: TableTimeState = { ...state };
  for (const id of userIds) {
    const prev = typeof next[id] === 'number' && Number.isFinite(next[id]) ? next[id] : 0;
    next[id] = prev + minutes;
  }
  return next;
}

// === Файловые обёртки ===

function load(): TableTimeState {
  try {
    const v = readJSON(FILE) as TableTimeState;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {}; // файла ещё нет или повреждён
  }
}

// Тик планировщика: начислить минуту всем сидящим. Пустой список — не пишем файл вовсе.
export function recordMinute(userIds: string[], minutes = 1): void {
  if (userIds.length === 0) return;
  writeJSON(FILE, applyTick(load(), userIds, minutes));
}

export function getMinutes(userId: string): number {
  const v = load()[userId];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

let timer: ReturnType<typeof setInterval> | null = null;

// Планировщик. seatedIds — поставщик текущего состава столов (GameManager.getSeatedHumanIds).
export function start(intervalMs: number, seatedIds: () => string[]): void {
  stop();
  timer = setInterval(() => {
    try {
      recordMinute(seatedIds(), intervalMs / 60_000);
    } catch (err) {
      console.error('⚠️ [table-time] тик упал:', err);
    }
  }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

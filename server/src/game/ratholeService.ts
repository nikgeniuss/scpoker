import { readJSON, writeJSON } from '../auth/storage.js';

// Защита от рэтхола (ROADMAP §10.6): игрок выигрывает крупный банк, уходит со стола и тут же
// садится обратно минимальным стеком — рискует малым, а выигранное держит вне игры. Правило:
// в течение окна (per-table опция `noRatholeHours`) вернуться за ТОТ ЖЕ стол можно только со
// стеком не меньше того, с которым ушёл. Проигравшего правило не трогает: ушёл с малым стеком —
// садится как обычно, минимальным бай-ином.
// Опция выключена по умолчанию: на уже созданных столах поведение не меняется.
// Источник правды — server/data/rathole.json (атомарно через writeJSON, §0.3).
const FILE = 'rathole.json';
// Записи старше самого длинного разумного окна не нужны никому — чистим на каждой записи,
// иначе файл рос бы вечно (одна строка на каждый выход каждого игрока).
const MAX_KEEP_HOURS = 24;

export interface LeaveRecord {
  chips: number; // с каким стеком ушёл
  at: number;    // когда (epoch ms)
}

// roomId → userId → запись. Ключ по столу: правило действует на том же столе, а не глобально.
export type RatholeState = Record<string, Record<string, LeaveRecord>>;

// === Чистая часть ===

export function isWithinWindow(rec: LeaveRecord | undefined, now: number, hours: number): boolean {
  if (!rec || hours <= 0) return false;
  return now - rec.at < hours * 3_600_000;
}

// Минимальная сумма входа для этого игрока. Правило не может требовать больше, чем у игрока есть
// (иначе выход с крупным стеком и последующий проигрыш в другом месте закрыли бы стол навсегда),
// и больше максимального бай-ина стола.
export function requiredBuyIn(
  rec: LeaveRecord | undefined,
  now: number,
  hours: number,
  bankroll: number,
  minBuyIn: number,
  maxBuyIn: number,
): number {
  if (!isWithinWindow(rec, now, hours)) return minBuyIn;
  return Math.max(minBuyIn, Math.min(rec!.chips, bankroll, maxBuyIn));
}

// Выбросить протухшие записи. Чистая функция — возвращает новый объект.
export function pruneExpired(state: RatholeState, now: number, maxKeepHours = MAX_KEEP_HOURS): RatholeState {
  const out: RatholeState = {};
  for (const [roomId, byUser] of Object.entries(state)) {
    const kept: Record<string, LeaveRecord> = {};
    for (const [userId, rec] of Object.entries(byUser)) {
      if (now - rec.at < maxKeepHours * 3_600_000) kept[userId] = rec;
    }
    if (Object.keys(kept).length > 0) out[roomId] = kept;
  }
  return out;
}

// === Файловые обёртки ===

function load(): RatholeState {
  try {
    const v = readJSON(FILE) as RatholeState;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {}; // файла ещё нет или повреждён — правило просто не сработает
  }
}

// Игрок ушёл со стола с таким-то стеком. Вызывать только для столов с включённой опцией и не
// для ботов — иначе копим мусор по всем столам рума.
export function recordLeave(roomId: string, userId: string, chips: number, now = Date.now()): void {
  const state = pruneExpired(load(), now);
  (state[roomId] ??= {})[userId] = { chips, at: now };
  writeJSON(FILE, state);
}

export function getLeaveRecord(roomId: string, userId: string): LeaveRecord | undefined {
  return load()[roomId]?.[userId];
}

// Игрок сел заново — запись отработала. Не чистить её означало бы, что следующий выход с малым
// стеком всё ещё меряется по старому, давно неактуальному числу.
export function clearLeaveRecord(roomId: string, userId: string): void {
  const state = load();
  if (!state[roomId]?.[userId]) return;
  delete state[roomId][userId];
  if (Object.keys(state[roomId]).length === 0) delete state[roomId];
  writeJSON(FILE, state);
}

// Стол закрылся — записи по нему больше не нужны.
export function clearRoom(roomId: string): void {
  const state = load();
  if (!state[roomId]) return;
  delete state[roomId];
  writeJSON(FILE, state);
}

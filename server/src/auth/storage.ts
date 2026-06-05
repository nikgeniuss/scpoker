import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

// === Дебаунсный async writer ===
// Раньше writeJSON делал sync writeFileSync + renameSync — блокирует event loop на 5-20мс
// на каждый sit/leave/cleanup. Теперь:
// - writeJSON sync-style API (вызвать и забыть), но реально пишет async через 200мс
// - множественные writeJSON одного файла в окно 200мс схлопываются в 1 disk-операцию
// - readJSON проверяет буфер первым (иначе read-modify-write терял бы свежие данные)
// - на shutdown (SIGINT/SIGTERM/beforeExit) sync-flush pending — иначе теряем последние 200мс
const writeBuffer = new Map<string, unknown>(); // filename → latest data
const pendingTimer = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 200;

async function flushOne(filename: string, data: unknown): Promise<void> {
  const fullPath = join(DATA_DIR, filename);
  const tmpPath = fullPath + '.tmp.' + process.pid + '.' + Date.now();
  const serialized = JSON.stringify(data, null, 2);
  try {
    await fsPromises.writeFile(tmpPath, serialized, 'utf-8');
    await fsPromises.rename(tmpPath, fullPath);
  } catch (err) {
    try { await fsPromises.unlink(tmpPath); } catch {}
    console.error('writeJSON async flush failed for', filename, err);
  }
}

function flushSyncOne(filename: string, data: unknown): void {
  const fullPath = join(DATA_DIR, filename);
  const tmpPath = fullPath + '.tmp.shutdown.' + process.pid;
  const serialized = JSON.stringify(data, null, 2);
  try {
    writeFileSync(tmpPath, serialized, 'utf-8');
    renameSync(tmpPath, fullPath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch {}
    console.error('writeJSON sync-shutdown flush failed for', filename, err);
  }
}

// Sync-flush всех pending writes — используется на shutdown.
function flushAllSync(): void {
  for (const [filename, timer] of pendingTimer) {
    clearTimeout(timer);
    const data = writeBuffer.get(filename);
    if (data !== undefined) flushSyncOne(filename, data);
  }
  pendingTimer.clear();
  writeBuffer.clear();
}

// Регистрируем shutdown-хуки один раз (защита от double-register при HMR/тестах).
declare const globalThis: { __storageShutdownRegistered?: boolean };
if (!globalThis.__storageShutdownRegistered) {
  globalThis.__storageShutdownRegistered = true;
  process.on('beforeExit', () => { flushAllSync(); });
  process.on('SIGINT', () => { flushAllSync(); process.exit(); });
  process.on('SIGTERM', () => { flushAllSync(); process.exit(); });
}

export function readJSON(filename: string): any {
  // Если есть pending write — читаем последнюю версию из буфера (свежее чем диск).
  // Иначе read-modify-write терял бы свежие данные между debounce-окнами.
  // Re-serialize чтобы вернуть независимую копию (старый readJSON всегда возвращал новый объект через JSON.parse).
  const pending = writeBuffer.get(filename);
  if (pending !== undefined) return JSON.parse(JSON.stringify(pending));
  const data = readFileSync(join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(data);
}

// Атомарная запись через tmp + rename, дебаунсированная на 200мс per-file.
// Множественные вызовы одного файла в окне = 1 disk-операция (последняя версия побеждает).
export function writeJSON(filename: string, data: unknown): void {
  writeBuffer.set(filename, data);
  if (pendingTimer.has(filename)) return; // уже запланировано — будет flush с последней версией
  const timer = setTimeout(() => {
    pendingTimer.delete(filename);
    const latest = writeBuffer.get(filename);
    writeBuffer.delete(filename);
    if (latest !== undefined) {
      void flushOne(filename, latest);
    }
  }, DEBOUNCE_MS);
  pendingTimer.set(filename, timer);
}

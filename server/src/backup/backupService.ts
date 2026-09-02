import { readdirSync, statSync, mkdirSync, copyFileSync, unlinkSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

// Резервное копирование server/data (ROADMAP §11.3): аккаунты, банкроллы, история рук и депозиты
// живут в JSON-файлах в единственном экземпляре — до этого модуля копий не было нигде.
// Две независимые линии защиты:
//   history/ — рабочая копия под собственным git-репозиторием: каждый прогон = коммит, поэтому
//              видно, что именно менялось в балансах, и можно откатиться на любой прошлый прогон.
//              Хранит все версии компактно (дельты), ротация не нужна.
//   daily/   — обычные копии папкой на дату, не зависящие от git: если репозиторий истории будет
//              повреждён, суточные снимки останутся читаемыми любым файловым менеджером.
// Обе линии лежат на той же машине, поэтому от отказа диска НЕ защищают — для этого нужна
// выгрузка наружу (отдельная задача, требует внешнего хранилища).
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const BACKUP_ROOT = join(__dirname, '../../backups');
const HISTORY_DIR = join(BACKUP_ROOT, 'history');
const DAILY_DIR = join(BACKUP_ROOT, 'daily');

// Брошенный временный файл заведомо старше этого возраста: реальная запись живёт миллисекунды
// (writeFile + rename в storage.ts), час — запас на три порядка.
const TEMP_MAX_AGE_MS = 60 * 60 * 1000;
const DAILY_KEEP = 14;

// === Чистые функции (ядро правил — тестируется без файловой системы) ===

// storage.ts пишет данные во временный файл (`<name>.json.tmp.<pid>.<ts>`) и переименовывает его —
// запись атомарна. Но если процесс убили жёстко (в проекте это штатный способ освободить порт,
// CLAUDE.md §7), переименование не случается и временный файл остаётся навсегда: к 2026-08-31
// накопилось 57 штук на 15 МБ при 2.7 МБ реальных данных.
export function isStaleTempFile(name: string, mtimeMs: number, nowMs: number, maxAgeMs = TEMP_MAX_AGE_MS): boolean {
  if (!name.includes('.tmp.')) return false; // настоящие данные — просто *.json, их не трогаем никогда
  return nowMs - mtimeMs > maxAgeMs;
}

// Что копировать в бэкап: только реальные данные, без временных хвостов.
export function pickDataFiles(names: readonly string[]): string[] {
  return names.filter(n => n.endsWith('.json') && !n.includes('.tmp.'));
}

// Какие суточные снимки удалить, оставив keep самых свежих. Имена вида YYYY-MM-DD сортируются
// лексикографически = хронологически.
export function pickDailyToDelete(dirs: readonly string[], keep: number): string[] {
  const sorted = [...dirs].sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

export function dayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// === Файловые операции ===

// Удаляет брошенные временные файлы. Три защиты от потери данных: только имена с `.tmp.`,
// только старше maxAgeMs, и никогда — обычные *.json.
export function cleanupStaleTempFiles(dir = DATA_DIR, maxAgeMs = TEMP_MAX_AGE_MS): { removed: number; freedBytes: number } {
  let removed = 0;
  let freedBytes = 0;
  if (!existsSync(dir)) return { removed, freedBytes };

  const now = Date.now();
  for (const name of readdirSync(dir)) {
    try {
      const full = join(dir, name);
      const st = statSync(full);
      if (!st.isFile() || !isStaleTempFile(name, st.mtimeMs, now, maxAgeMs)) continue;
      unlinkSync(full);
      removed++;
      freedBytes += st.size;
    } catch {
      // файл уже исчез или занят — не мешаем работе сервера, попробуем на следующем прогоне
    }
  }
  return { removed, freedBytes };
}

export function copyDataFiles(fromDir: string, toDir: string): number {
  mkdirSync(toDir, { recursive: true });
  const files = pickDataFiles(readdirSync(fromDir));
  for (const name of files) {
    copyFileSync(join(fromDir, name), join(toDir, name));
  }
  return files.length;
}

function git(args: string[], cwd: string): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile('git', args, { cwd, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}` });
    });
  });
}

// Коммит текущего состояния history/. Отсутствие git в системе или пустой diff — не ошибка:
// суточные копии в daily/ работают независимо и остаются основной гарантией.
async function commitHistory(): Promise<boolean> {
  if (!existsSync(join(HISTORY_DIR, '.git'))) {
    const init = await git(['init', '--quiet'], HISTORY_DIR);
    if (!init.ok) return false;
    // Локальная личность репозитория — чтобы коммит не зависел от глобальных настроек машины.
    await git(['config', 'user.email', 'backup@localhost'], HISTORY_DIR);
    await git(['config', 'user.name', 'scpoker backup'], HISTORY_DIR);
  }
  const add = await git(['add', '-A'], HISTORY_DIR);
  if (!add.ok) return false;
  const commit = await git(['commit', '--quiet', '-m', `snapshot ${new Date().toISOString()}`], HISTORY_DIR);
  return commit.ok; // false и при «nothing to commit» — данные не менялись, это норма
}

export async function runBackup(): Promise<void> {
  try {
    const cleaned = cleanupStaleTempFiles();
    if (cleaned.removed > 0) {
      console.log(`🧹 [backup] убрано брошенных временных файлов: ${cleaned.removed} (${Math.round(cleaned.freedBytes / 1024)} КБ)`);
    }

    const copied = copyDataFiles(DATA_DIR, HISTORY_DIR);
    await commitHistory();

    // Суточная копия — первый прогон в новый день создаёт её, дальше день пропускается.
    const today = join(DAILY_DIR, dayStamp());
    if (!existsSync(today)) {
      copyDataFiles(DATA_DIR, today);
      const existing = existsSync(DAILY_DIR) ? readdirSync(DAILY_DIR) : [];
      for (const stale of pickDailyToDelete(existing, DAILY_KEEP)) {
        rmSync(join(DAILY_DIR, stale), { recursive: true, force: true });
      }
      console.log(`💾 [backup] суточная копия ${dayStamp()} создана (${copied} файлов)`);
    }
  } catch (err) {
    // Бэкап никогда не должен ронять игровой процесс — при сбое просто ждём следующего прогона.
    console.error('⚠️ [backup] прогон не удался:', err);
  }
}

let timer: NodeJS.Timeout | null = null;

export function start(intervalMs: number): void {
  stop();
  void runBackup(); // первый снимок сразу на старте, не через интервал
  timer = setInterval(() => { void runBackup(); }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

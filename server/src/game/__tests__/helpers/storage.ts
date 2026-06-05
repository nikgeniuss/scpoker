// In-memory подмена для server/src/auth/storage.ts. В тестах через vi.mock:
//
//   vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));
//
// Подменяет readJSON/writeJSON у GameManager И BotManager одновременно. State персистится
// между вызовами в рамках одного test-файла; clearStorage() в beforeEach сбрасывает.

const store = new Map<string, unknown>();

// Read-side facade. Дублирует поведение storage.ts: бросает если файла нет.
export function readJSON(file: string): unknown {
  const v = store.get(file);
  if (v === undefined) {
    throw new Error('ENOENT (mock storage): ' + file);
  }
  return JSON.parse(JSON.stringify(v));
}

// Write-side facade. Дублирует storage.ts атомарную запись (но без tmp+rename, in-memory).
export function writeJSON(file: string, data: unknown): void {
  store.set(file, JSON.parse(JSON.stringify(data)));
}

// Test API — не существует в production storage.ts. Использовать в beforeEach.
export function setStorage(file: string, data: unknown): void {
  store.set(file, JSON.parse(JSON.stringify(data)));
}

export function getStorage(file: string): unknown {
  const v = store.get(file);
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

export function clearStorage(): void {
  store.clear();
}

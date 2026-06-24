// In-memory подмена для server/src/auth/storage.ts в тестах модуля payments. См.
// аналогичный хелпер server/src/game/__tests__/helpers/storage.ts (не шарим между доменами
// намеренно — §0.11, тривиальный код, дешевле продублировать, чем тащить cross-domain импорт).
//
//   vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

const store = new Map<string, unknown>();

export function readJSON(file: string): unknown {
  const v = store.get(file);
  if (v === undefined) {
    throw new Error('ENOENT (mock storage): ' + file);
  }
  return JSON.parse(JSON.stringify(v));
}

export function writeJSON(file: string, data: unknown): void {
  store.set(file, JSON.parse(JSON.stringify(data)));
}

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

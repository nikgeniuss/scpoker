import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Атомарная запись server/data (§0.3). На Windows rename поверх существующего файла падает с
// EPERM/EBUSY, если хендл держит Defender/индексатор или параллельный флаш того же файла —
// живой прогон 2026-09-02 дал 5 срывов, все по самому горячему active-hands.json, причём два
// подряд с разницей ~450мс (наложение флашей). Лечение: очередь на файл + ретрай.
const writeFile = vi.fn<(...args: unknown[]) => Promise<void>>();
const rename = vi.fn<(...args: unknown[]) => Promise<void>>();
const unlink = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  promises: {
    writeFile: (...args: unknown[]) => writeFile(...args),
    rename: (...args: unknown[]) => rename(...args),
    unlink: (...args: unknown[]) => unlink(...args),
  },
}));

const { writeJSON } = await import('../storage.js');

const fsError = (code: string) => Object.assign(new Error(code), { code });

describe('writeJSON — атомарная запись под нагрузкой', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeFile.mockReset().mockResolvedValue(undefined);
    rename.mockReset().mockResolvedValue(undefined);
    unlink.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('повторяет rename при EPERM и доводит запись до конца', async () => {
    rename
      .mockRejectedValueOnce(fsError('EPERM'))
      .mockRejectedValueOnce(fsError('EBUSY'))
      .mockResolvedValueOnce(undefined);

    writeJSON('retry-a.json', { a: 1 });
    await vi.advanceTimersByTimeAsync(500);

    expect(rename).toHaveBeenCalledTimes(3);
    expect(console.error).not.toHaveBeenCalled(); // сбой пережит молча, данные записаны
    expect(unlink).not.toHaveBeenCalled();        // tmp не удалён — он уехал в целевой файл
  });

  it('сдаётся после лимита попыток и не молчит об этом', async () => {
    rename.mockRejectedValue(fsError('EPERM'));

    writeJSON('retry-b.json', { a: 1 });
    await vi.advanceTimersByTimeAsync(2000);

    expect(rename).toHaveBeenCalledTimes(4); // 1 попытка + 3 ретрая
    expect(console.error).toHaveBeenCalled();
    expect(unlink).toHaveBeenCalled();       // tmp прибран, мусор не копится
  });

  it('НЕ ретраит содержательные ошибки (ENOSPC) — это не транзиентный сбой', async () => {
    rename.mockRejectedValue(fsError('ENOSPC'));

    writeJSON('retry-c.json', { a: 1 });
    await vi.advanceTimersByTimeAsync(2000);

    expect(rename).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('два флаша одного файла не идут внахлёст — второй ждёт первый', async () => {
    let releaseFirst: () => void = () => {};
    writeFile
      .mockImplementationOnce(() => new Promise<void>((res) => { releaseFirst = () => res(); }))
      .mockResolvedValue(undefined);

    writeJSON('queue.json', { v: 1 });
    await vi.advanceTimersByTimeAsync(250); // первый флаш стартовал и завис на writeFile
    expect(writeFile).toHaveBeenCalledTimes(1);

    writeJSON('queue.json', { v: 2 });
    await vi.advanceTimersByTimeAsync(250);
    expect(writeFile).toHaveBeenCalledTimes(1); // второй ещё не начался — очередь держит
    expect(rename).not.toHaveBeenCalled();

    releaseFirst();
    await vi.advanceTimersByTimeAsync(50);
    expect(writeFile).toHaveBeenCalledTimes(2); // первый закончил → пошёл второй
    expect(rename).toHaveBeenCalledTimes(2);
  });

  it('разные файлы пишутся независимо (очередь per-file, а не глобальная)', async () => {
    let releaseA: () => void = () => {};
    writeFile.mockImplementationOnce(() => new Promise<void>((res) => { releaseA = () => res(); }));

    writeJSON('slow.json', { v: 1 });
    await vi.advanceTimersByTimeAsync(250);
    writeJSON('fast.json', { v: 1 });
    await vi.advanceTimersByTimeAsync(250);

    expect(writeFile).toHaveBeenCalledTimes(2); // fast.json не ждал slow.json
    releaseA();
    await vi.advanceTimersByTimeAsync(50);
  });
});

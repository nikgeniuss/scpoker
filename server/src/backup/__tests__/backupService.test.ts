import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, rmSync, utimesSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isStaleTempFile, pickDataFiles, pickDailyToDelete, dayStamp, cleanupStaleTempFiles, copyDataFiles,
} from '../backupService.js';

describe('backupService — правила отбора файлов', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  it('брошенный временный файл старше порога — под уборку', () => {
    expect(isStaleTempFile('hands.json.tmp.6724.1787456966603', now - 2 * HOUR, now)).toBe(true);
    expect(isStaleTempFile('users.json.tmp.shutdown.444', now - 2 * HOUR, now)).toBe(true);
  });

  it('свежий временный файл не трогаем — прямо сейчас может идти запись', () => {
    expect(isStaleTempFile('hands.json.tmp.6724.1787456966603', now - 1000, now)).toBe(false);
  });

  it('настоящие данные не считаются мусором ни при каком возрасте', () => {
    expect(isStaleTempFile('users.json', now - 400 * HOUR, now)).toBe(false);
    expect(isStaleTempFile('deposits.json', 0, now)).toBe(false);
  });

  it('копируются только реальные json, без временных хвостов', () => {
    const picked = pickDataFiles([
      'users.json', 'deposits.json', 'hands.json.tmp.6724.1787456966603',
      'bots.json.tmp.shutdown.444', 'README.md', 'rooms.json',
    ]);
    expect(picked).toEqual(['users.json', 'deposits.json', 'rooms.json']);
  });

  it('ротация суточных копий оставляет N самых свежих', () => {
    const dirs = ['2026-08-01', '2026-08-03', '2026-08-02', '2026-08-05', '2026-08-04'];
    expect(pickDailyToDelete(dirs, 3)).toEqual(['2026-08-01', '2026-08-02']);
    expect(pickDailyToDelete(dirs, 10)).toEqual([]); // копий меньше лимита — не удаляем ничего
  });

  it('dayStamp даёт сортируемую дату YYYY-MM-DD', () => {
    expect(dayStamp(new Date('2026-08-31T21:15:00Z'))).toBe('2026-08-31');
  });
});

describe('backupService — операции с файлами', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'scpoker-backup-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function write(name: string, ageMs = 0): string {
    const full = join(dir, name);
    writeFileSync(full, '{"a":1}');
    if (ageMs > 0) {
      const t = (Date.now() - ageMs) / 1000;
      utimesSync(full, t, t);
    }
    return full;
  }

  it('уборка удаляет только устаревший мусор и не трогает данные', () => {
    write('users.json', 5 * 60 * 60 * 1000);       // старые данные — остаются
    write('rooms.json');
    write('hands.json.tmp.111.222', 5 * 60 * 60 * 1000); // старый мусор — под уборку
    write('bots.json.tmp.333.444');                 // свежий мусор — пока не трогаем

    const result = cleanupStaleTempFiles(dir);

    expect(result.removed).toBe(1);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(readdirSync(dir).sort()).toEqual(['bots.json.tmp.333.444', 'rooms.json', 'users.json']);
  });

  it('уборка не падает на несуществующей папке', () => {
    expect(cleanupStaleTempFiles(join(dir, 'нет-такой'))).toEqual({ removed: 0, freedBytes: 0 });
  });

  it('копирование переносит данные и пропускает временные файлы', () => {
    write('users.json');
    write('deposits.json');
    write('hands.json.tmp.111.222');
    const target = join(dir, 'out');

    const copied = copyDataFiles(dir, target);

    expect(copied).toBe(2);
    expect(readdirSync(target).sort()).toEqual(['deposits.json', 'users.json']);
    expect(existsSync(join(target, 'hands.json.tmp.111.222'))).toBe(false);
  });
});

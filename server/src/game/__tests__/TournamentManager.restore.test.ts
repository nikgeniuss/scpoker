import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { setStorage } from './helpers/storage.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';
import type { TournamentInfo } from '@poker-room/shared';

// Автоудаление завершённого турнира из списка — обычный setTimeout, он не переживает рестарт
// сервера. До фикса (ROADMAP §10.19) турнир, доигранный ДО перезапуска, оставался в лобби
// навсегда: тестовые турниры так провисели ~10 дней и были замечены только вручную.
const MINUTE = 60_000;

function finishedTournament(id: string, finishedAt: number | undefined): TournamentInfo {
  return {
    id,
    name: 'Archived ' + id,
    type: 'sng',
    format: 'nlh',
    status: 'finished',
    buyIn: 1000,
    startingStack: 1000,
    tableSize: 6,
    blindSpeed: 'turbo',
    levelUpMinutes: 10,
    lateRegMinutes: 0,
    itmPercent: 20,
    prizePool: 0,
    entries: [],
    tableIds: [],
    createdBy: 'admin1',
    createdAt: finishedAt ?? Date.now(),
    finishedAt,
  } as unknown as TournamentInfo;
}

describe('TournamentManager — восстановление после рестарта', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'admin1', username: 'admin1', chips: 100000 }] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('завершённый до рестарта турнир не остаётся в списке навсегда', async () => {
    // Доигран 40 минут назад — окно показа результата (30 мин) уже прошло.
    setStorage('tournaments.json', [finishedTournament('t-old', Date.now() - 40 * MINUTE)]);
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    tm.restoreTournaments();
    expect(tm.get('t-old')).toBeTruthy(); // сразу после восстановления ещё в списке

    await vi.advanceTimersByTimeAsync(0); // удаление запланировано на ближайший тик
    expect(tm.get('t-old')).toBeNull();
  });

  it('недавно завершённый турнир доживает остаток окна показа, а не исчезает сразу', async () => {
    setStorage('tournaments.json', [finishedTournament('t-fresh', Date.now() - 5 * MINUTE)]);
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    tm.restoreTournaments();

    await vi.advanceTimersByTimeAsync(20 * MINUTE); // прошло 25 из 30 минут
    expect(tm.get('t-fresh')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(10 * MINUTE); // окно закрылось
    expect(tm.get('t-fresh')).toBeNull();
  });

  it('запись без отметки времени завершения (сохранена до фикса) тоже убирается', async () => {
    setStorage('tournaments.json', [finishedTournament('t-legacy', undefined)]);
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    tm.restoreTournaments();
    await vi.advanceTimersByTimeAsync(0);

    expect(tm.get('t-legacy')).toBeNull();
  });
});

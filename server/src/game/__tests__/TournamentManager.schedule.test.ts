import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// Расписание старта (ROADMAP §10.19, 2026-07-07): regOpensAt гейтит register() до открытия
// регистрации, scheduledStartAt — авто-старт по таймеру (SNG ждёт точное время даже при заполненном
// столе; MTT стартует как обычный forceStart). <2 зарегистрированных на момент scheduledStartAt —
// авто-отмена с возвратом бай-инов (решение пользователя, не зависать в ожидании недобора).

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

describe('TournamentManager — расписание старта (regOpensAt/scheduledStartAt)', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'A', username: 'Alice', chips: 5000 }, { id: 'B', username: 'Bob', chips: 5000 }] });
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('create() отклоняет некорректные regOpensAt/scheduledStartAt', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const base = {
      name: 'X', type: 'sng' as const, format: 'nlh' as const, buyIn: 0, startingStack: 1000,
      tableSize: 6, blindSpeed: 'regular' as const, levelUpMinutes: 10,
    };
    expect(tm.create({ ...base, regOpensAt: -1 }, 'admin1')).toEqual({ error: 'invalid-reg-opens-at' });
    expect(tm.create({ ...base, scheduledStartAt: 0 }, 'admin1')).toEqual({ error: 'invalid-scheduled-start-at' });
    expect(
      tm.create({ ...base, regOpensAt: Date.now() + 10_000, scheduledStartAt: Date.now() }, 'admin1'),
    ).toEqual({ error: 'scheduled-start-before-reg-opens' });
  });

  it('регистрация отклоняется до regOpensAt, открывается автоматически после наступления времени', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const regOpensAt = Date.now() + 60_000;
    const created = tm.create(
      { name: 'Scheduled Reg', type: 'sng', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10, regOpensAt },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    expect(tm.register(created.id, 'A', 'Alice')).toEqual({ error: 'registration-not-open' });

    vi.advanceTimersByTime(60_000);

    const reg = tm.register(created.id, 'A', 'Alice');
    if ('error' in reg) throw new Error(reg.error);
    expect(reg.entries).toHaveLength(1);
  });

  it('SNG со scheduledStartAt НЕ стартует раньше срока даже при заполненном столе — ждёт точное время', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const scheduledStartAt = Date.now() + 60_000;
    const created = tm.create(
      { name: 'Scheduled SNG', type: 'sng', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10, scheduledStartAt },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    tm.register(created.id, 'A', 'Alice');
    const afterFill = tm.register(created.id, 'B', 'Bob'); // стол полон (tableSize=2), но авто-старт по заполнению выключен
    if ('error' in afterFill) throw new Error(afterFill.error);
    expect(afterFill.status).toBe('registering');

    vi.advanceTimersByTime(60_000); // ровно scheduledStartAt

    expect(tm.get(created.id)!.status).toBe('running');
  });

  it('меньше 2 зарегистрированных на момент scheduledStartAt — авто-отмена с возвратом бай-инов', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const scheduledStartAt = Date.now() + 30_000;
    const created = tm.create(
      { name: 'Lonely', type: 'sng', format: 'nlh', buyIn: 500, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10, scheduledStartAt },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    expect(usersChips().A).toBe(4500);

    vi.advanceTimersByTime(30_000);

    const cancelled = tm.get(created.id)!;
    expect(cancelled.status).toBe('cancelled');
    expect(usersChips().A).toBe(5000); // бай-ин возвращён
  });

  it('MTT: авто-старт по scheduledStartAt рассаживает по столам как forceStart', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const scheduledStartAt = Date.now() + 15_000;
    const created = tm.create(
      { name: 'Scheduled MTT', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10, scheduledStartAt },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');

    vi.advanceTimersByTime(15_000);

    const started = tm.get(created.id)!;
    expect(started.status).toBe('running');
    expect(started.tableIds).toHaveLength(1);
  });

  it('forceStart до scheduledStartAt отменяет отложенный таймер — повторного действия при наступлении времени нет', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const scheduledStartAt = Date.now() + 60_000;
    const created = tm.create(
      { name: 'ForceOverride', type: 'sng', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10, scheduledStartAt },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');

    const forced = tm.forceStart(created.id);
    if ('error' in forced) throw new Error(forced.error);
    expect(forced.status).toBe('running');

    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    expect(tm.get(created.id)!.status).toBe('running');
  });
});

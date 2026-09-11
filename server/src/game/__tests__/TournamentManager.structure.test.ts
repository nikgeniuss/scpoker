import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// getStructure — предпросмотр разбивки призовых для карточки в лобби (§10.19). Ключевое отличие
// от getStandings: доступен ПРИ ЛЮБОМ статусе, в том числе до старта, — иначе игрок не видит,
// как делится банк, ровно тогда, когда решает, регистрироваться ли.

describe('TournamentManager.getStructure', () => {
  beforeEach(() => {
    resetStorage({
      users: [
        { id: 'A', username: 'Alice', chips: 5000 },
        { id: 'B', username: 'Bob', chips: 5000 },
      ],
    });
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function makeTournament(overrides: Record<string, unknown> = {}) {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Structure Test',
        type: 'sng',
        format: 'nlh',
        buyIn: 1000,
        startingStack: 1000,
        tableSize: 3,
        blindSpeed: 'turbo',
        levelUpMinutes: 10,
        ...overrides,
      } as Parameters<TournamentManager['create']>[0],
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    return { tm, id: created.id };
  }

  it('несуществующий турнир — null', async () => {
    const { tm } = await makeTournament();
    expect(tm.getStructure('no-such-id')).toBeNull();
  });

  it('до старта (никто не зарегистрирован) — банк пуст, суммы по местам нулевые', async () => {
    const { tm, id } = await makeTournament();
    const s = tm.getStructure(id);
    expect(s).not.toBeNull();
    expect(s!.prizePool).toBe(0);
    // Места по конфигурации уже известны, но платить пока нечего — карточка в лобби на этот
    // случай показывает подпись «разбивка появится», а не столбик нулей.
    expect(Object.values(s!.payout).every((v) => v === 0)).toBe(true);
  });

  it('после регистраций — банк и разбивка по местам считаются ещё до старта', async () => {
    const { tm, id } = await makeTournament();
    tm.register(id, 'A', 'Alice');
    tm.register(id, 'B', 'Bob');

    const s = tm.getStructure(id)!;
    expect(s.prizePool).toBe(2000);
    expect(s.paidPlaces).toBeGreaterThan(0);
    // Сумма выплат не превышает собранный банк — иначе рум платит из своих (см. §11 постмортем
    // про двойные выплаты).
    const total = Object.values(s.payout).reduce((sum, v) => sum + v, 0);
    expect(total).toBeLessThanOrEqual(s.prizePool);
    expect(Object.keys(s.payout).length).toBe(s.paidPlaces);
  });

  it('гарантия MTT попадает в структуру как есть, банк ею не подменяется', async () => {
    const { tm, id } = await makeTournament({ type: 'mtt', guaranteedPrizePool: 10000, minPlayers: 2 });
    tm.register(id, 'A', 'Alice');

    const s = tm.getStructure(id)!;
    expect(s.guaranteedPrizePool).toBe(10000);
    // prizePool — реально собранное; оверлей доплачивается только на finish(), не в предпросмотре.
    expect(s.prizePool).toBe(1000);
  });
});

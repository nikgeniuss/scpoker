import { describe, it, expect } from 'vitest';
import {
  computeTotalsByUser,
  toRoi,
  applyTournamentTotals,
  type TournamentEntryInput,
  type TournamentTotalsState,
} from '../tournamentPlayerTotals.js';

// Личные турнирные итоги игрока (ROI профиля §9.1 + прогресс достижений §10.21.3) — чистые
// функции. Копятся при finish(), а не считаются по списку турниров: завершённый турнир уходит
// из списка через 30 минут (scheduleAutoRemove), и метрики по нему откатывались бы к нулю.

const entry = (
  o: Partial<TournamentEntryInput> & { tournamentId: string; userId: string; buyIn: number },
): TournamentEntryInput => o;
const empty: TournamentTotalsState = { users: {}, recorded: [] };

describe('computeTotalsByUser — деньги', () => {
  it('приз и баунти складываются в возврат', () => {
    const entries = [entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, prize: 1400, bountyWon: 600 })];
    expect(computeTotalsByUser(entries).u1).toMatchObject({ spent: 1000, returned: 2000 });
  });

  it('игроки не смешиваются между собой', () => {
    const entries = [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, prize: 3000, finishPlace: 1 }),
      entry({ tournamentId: 't1', userId: 'u2', buyIn: 1000, finishPlace: 2 }),
    ];
    const out = computeTotalsByUser(entries);
    expect(out.u1).toEqual({ spent: 1000, returned: 3000, tournaments: 1, wins: 1 });
    expect(out.u2).toEqual({ spent: 1000, returned: 0, tournaments: 1, wins: 0 });
  });

  it('ре-энтри в том же турнире стоит reEntryFee, первый вход — buyIn', () => {
    const entries = [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, reEntryFee: 500 }),
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, reEntryFee: 500, prize: 3000 }),
    ];
    expect(computeTotalsByUser(entries).u1).toMatchObject({ spent: 1500, returned: 3000 });
  });

  it('без reEntryFee ре-энтри стоит столько же, сколько бай-ин', () => {
    const entries = [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000 }),
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000 }),
    ];
    expect(computeTotalsByUser(entries).u1.spent).toBe(2000);
  });

  it('вход по промокоду бесплатный — банкролл не списывался, в затраты не идёт', () => {
    const entries = [entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, promoCode: 'FREE', prize: 500 })];
    expect(computeTotalsByUser(entries).u1).toMatchObject({ spent: 0, returned: 500, tournaments: 1 });
  });
});

describe('computeTotalsByUser — счётчики достижений', () => {
  it('ре-энтри НЕ считается вторым сыгранным турниром', () => {
    const entries = [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 100 }),
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 100 }),
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 100 }),
    ];
    expect(computeTotalsByUser(entries).u1.tournaments).toBe(1);
  });

  it('победа — только первое место, второе не считается', () => {
    const entries = [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 100, finishPlace: 1 }),
      entry({ tournamentId: 't2', userId: 'u1', buyIn: 100, finishPlace: 2 }),
    ];
    expect(computeTotalsByUser(entries).u1).toMatchObject({ tournaments: 2, wins: 1 });
  });

  it('вылетевший без места (турнир без призов у этого игрока) побед не получает', () => {
    const entries = [entry({ tournamentId: 't1', userId: 'u1', buyIn: 100 })];
    expect(computeTotalsByUser(entries).u1.wins).toBe(0);
  });
});

describe('toRoi', () => {
  it('без вложений процента нет (null), а не 0', () => {
    expect(toRoi(undefined)).toEqual({ spent: 0, returned: 0, roiPercent: null });
    expect(toRoi({ spent: 0, returned: 500 }).roiPercent).toBeNull();
  });

  it('вернул вдвое больше вложенного — +100%, не вернул ничего — −100%', () => {
    expect(toRoi({ spent: 1000, returned: 2000 }).roiPercent).toBe(100);
    expect(toRoi({ spent: 1000, returned: 0 }).roiPercent).toBe(-100);
  });
});

describe('applyTournamentTotals', () => {
  it('накапливает итоги по турнирам, id учтённого турнира запоминается', () => {
    const s1 = applyTournamentTotals(empty, 't1', [
      entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, prize: 2000, finishPlace: 1 }),
    ]);
    const s2 = applyTournamentTotals(s1, 't2', [entry({ tournamentId: 't2', userId: 'u1', buyIn: 500 })]);
    expect(s2.users.u1).toEqual({ spent: 1500, returned: 2000, tournaments: 2, wins: 1 });
    expect(s2.recorded).toEqual(['t2', 't1']);
  });

  it('повторный учёт того же турнира ничего не добавляет (идемпотентность)', () => {
    const entries = [entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000, prize: 2000, finishPlace: 1 })];
    const s1 = applyTournamentTotals(empty, 't1', entries);
    expect(applyTournamentTotals(s1, 't1', entries)).toBe(s1);
  });

  it('не мутирует исходное состояние', () => {
    const state: TournamentTotalsState = {
      users: { u1: { spent: 100, returned: 0, tournaments: 1, wins: 0 } },
      recorded: [],
    };
    applyTournamentTotals(state, 't1', [entry({ tournamentId: 't1', userId: 'u1', buyIn: 1000 })]);
    expect(state.users.u1).toEqual({ spent: 100, returned: 0, tournaments: 1, wins: 0 });
    expect(state.recorded).toEqual([]);
  });
});

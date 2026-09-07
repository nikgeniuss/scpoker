import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, getStorage } from './helpers/storage.js';
import { buildLedgerEntry, recordTournamentFinish, getTournamentLedger, summarizeLedger } from '../tournament/tournamentLedger.js';
import type { TournamentInfo } from '@poker-room/shared';

// Журнал турнирной экономики. Главное, ради чего он есть: overlay — эмиссия фишек (на финише
// prizePool растёт, ниоткуда не списываясь), и её единственный след — overlayPaid внутри турнира,
// который исчезает при уборке турнира из лобби.
function tournament(over: Partial<TournamentInfo> = {}): TournamentInfo {
  return {
    id: 't1', name: 'Гарантия', type: 'mtt', format: 'nlh', status: 'finished',
    buyIn: 1000, startingStack: 5000, tableSize: 9, blindSpeed: 'turbo', levelUpMinutes: 5,
    prizePool: 10000, entries: [], tableIds: [], lateRegMinutes: 0, createdBy: 'admin', createdAt: 1,
    ...over,
  } as unknown as TournamentInfo;
}

const entry = (userId: string, prize?: number) =>
  ({ userId, username: userId, status: 'eliminated', ...(prize ? { prize } : {}) }) as TournamentInfo['entries'][number];

describe('buildLedgerEntry — сводка по завершённому турниру', () => {
  it('net = рейк минус оверлей: турнир с гарантией без бай-инов стоит руму денег', () => {
    const e = buildLedgerEntry(
      tournament({ collectedFees: 0, collectedRake: 0, overlayPaid: 10000, prizePool: 10000,
        entries: [entry('A', 5455), entry('B', 2727), entry('C', 1818)] }),
      1000,
    );
    expect(e.overlay).toBe(10000);
    expect(e.paidOut).toBe(10000);
    expect(e.net).toBe(-10000); // чистый расход рума — ровно то, что прогон 2026-09-02 не показывал
  });

  it('net положителен, когда рейк собран, а гарантия не сработала', () => {
    const e = buildLedgerEntry(
      tournament({ collectedFees: 20000, collectedRake: 2000, overlayPaid: undefined, prizePool: 18000,
        entries: [entry('A', 18000)] }),
      1000,
    );
    expect(e.rake).toBe(2000);
    expect(e.overlay).toBe(0);
    expect(e.net).toBe(2000);
  });

  it('считает входы и уникальных игроков раздельно (ре-энтри — отдельный вход)', () => {
    const e = buildLedgerEntry(
      tournament({ entries: [entry('A'), entry('A'), entry('B')] }),
      1000,
    );
    expect(e.entries).toBe(3);
    expect(e.uniquePlayers).toBe(2);
  });
});

describe('recordTournamentFinish — запись в журнал', () => {
  beforeEach(() => clearStorage());

  it('пишет строку и переживает уборку турнира из лобби', () => {
    recordTournamentFinish(tournament({ overlayPaid: 10000, entries: [entry('A', 10000)] }), 5000);
    const log = getTournamentLedger();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tournamentId: 't1', overlay: 10000, paidOut: 10000, net: -10000 });
    expect(getStorage('tournament-ledger.json')).toHaveLength(1); // лежит на диске, не в памяти турнира
  });

  it('идемпотентен по tournamentId — повторный finish не задваивает строку', () => {
    recordTournamentFinish(tournament({ overlayPaid: 10000 }), 5000);
    recordTournamentFinish(tournament({ overlayPaid: 10000 }), 6000);
    const log = getTournamentLedger();
    expect(log).toHaveLength(1);
    expect(log[0].finishedAt).toBe(6000); // осталась последняя версия
  });

  it('новые турниры идут сверху', () => {
    recordTournamentFinish(tournament({ id: 'old' }), 1000);
    recordTournamentFinish(tournament({ id: 'new' }), 2000);
    expect(getTournamentLedger().map((e) => e.tournamentId)).toEqual(['new', 'old']);
  });
});

describe('summarizeLedger — итоги', () => {
  it('складывает рейк, оверлей и выплаты по всем турнирам', () => {
    const totals = summarizeLedger([
      buildLedgerEntry(tournament({ id: 'a', collectedRake: 500, overlayPaid: 0, entries: [entry('A', 4000)] }), 1),
      buildLedgerEntry(tournament({ id: 'b', collectedRake: 0, overlayPaid: 10000, entries: [entry('B', 10000)] }), 2),
    ]);
    expect(totals).toMatchObject({ tournaments: 2, rake: 500, overlay: 10000, paidOut: 14000, net: -9500 });
  });
});

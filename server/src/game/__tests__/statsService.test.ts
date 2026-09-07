import { describe, it, expect } from 'vitest';
import {
  aggregateRecords,
  aggregateAllRecords,
  aggregateAllRecordsInPeriod,
  aggregateOverview,
  aggregateTables,
  aggregateByFormat,
  type HandStatRecord,
} from '../statsService.js';
import {
  computeHudStats,
  type HandHistoryRecord,
} from '../handHistory.js';

const recs: HandStatRecord[] = [
  { t: 1000, roomId: 'r1', userId: 'u1', delta: 100, rake: 0 },
  { t: 2000, roomId: 'r1', userId: 'u1', delta: -30, rake: 0 },
  { t: 3000, roomId: 'r2', userId: 'u2', delta: 50, rake: 0 },
  { t: 5000, roomId: 'r1', userId: 'u1', delta: 20, rake: 0 },
];

describe('statsService — чистые агрегаторы', () => {
  it('aggregateRecords: всё время по юзеру (сумма дельт + счётчик рук)', () => {
    expect(aggregateRecords(recs, 'u1', null, null)).toEqual({ hands: 3, pnl: 90, rake: 0, wins: 2 });
  });

  it('aggregateRecords: окно [since, until] включительно', () => {
    // t=2000 попадает, t=5000 за верхней границей
    expect(aggregateRecords(recs, 'u1', 2000, 4000)).toEqual({ hands: 1, pnl: -30, rake: 0, wins: 0 });
  });

  it('aggregateRecords: only-since и only-until границы', () => {
    expect(aggregateRecords(recs, 'u1', 2000, null)).toEqual({ hands: 2, pnl: -10, rake: 0, wins: 1 });
    expect(aggregateRecords(recs, 'u1', null, 1500)).toEqual({ hands: 1, pnl: 100, rake: 0, wins: 1 });
  });

  it('aggregateRecords: неизвестный юзер → нули', () => {
    expect(aggregateRecords(recs, 'nope', null, null)).toEqual({ hands: 0, pnl: 0, rake: 0, wins: 0 });
  });

  it('aggregateAllRecords: разбивка по всем юзерам', () => {
    const all = aggregateAllRecords(recs);
    expect(all['u1']).toEqual({ hands: 3, pnl: 90, rake: 0, wins: 2 });
    expect(all['u2']).toEqual({ hands: 1, pnl: 50, rake: 0, wins: 1 });
  });

  it('aggregateAllRecordsInPeriod: без границ = как aggregateAllRecords', () => {
    expect(aggregateAllRecordsInPeriod(recs, null, null)).toEqual(aggregateAllRecords(recs));
  });

  it('aggregateAllRecordsInPeriod: окно отфильтровывает старые записи (для таблицы лидеров)', () => {
    const inWindow = aggregateAllRecordsInPeriod(recs, 2000, null);
    expect(inWindow['u1']).toEqual({ hands: 2, pnl: -10, rake: 0, wins: 1 }); // t=2000,5000
    expect(inWindow['u2']).toEqual({ hands: 1, pnl: 50, rake: 0, wins: 1 }); // t=3000
  });
});

// Несколько записей с одинаковыми (roomId, t) = одна раздача с N игроками.
const multi: HandStatRecord[] = [
  { t: 1000, roomId: 'r1', userId: 'u1', delta: 100, rake: 0 },
  { t: 1000, roomId: 'r1', userId: 'u2', delta: -100, rake: 0 },
  { t: 2000, roomId: 'r1', userId: 'u1', delta: -30, rake: 0 },
  { t: 3000, roomId: 'r2', userId: 'u2', delta: 50, rake: 0 },
];

describe('statsService — overview/по столам', () => {
  it('aggregateOverview: игры = уникальные (roomId+t), pnl/rake суммируются, столы уникальны', () => {
    // raздачи: r1#1000, r1#2000, r2#3000 = 3; pnl=100-100-30+50=20; столов 2
    expect(aggregateOverview(multi, null, null)).toEqual({
      games: 3,
      pnl: 20,
      rake: 0,
      tablesActive: 2,
    });
  });

  it('aggregateOverview: окно [since, until]', () => {
    // since=2000: r1#2000 (pnl -30) + r2#3000 (pnl 50) = 2 игры, pnl 20, столов 2
    expect(aggregateOverview(multi, 2000, null)).toEqual({
      games: 2,
      pnl: 20,
      rake: 0,
      tablesActive: 2,
    });
  });

  it('aggregateTables: разбивка по столам, сортировка по числу игр', () => {
    expect(aggregateTables(multi, null, null)).toEqual([
      { roomId: 'r1', games: 2, pnl: -30, rake: 0 },
      { roomId: 'r2', games: 1, pnl: 50, rake: 0 },
    ]);
  });
});

describe('statsService — по форматам', () => {
  const mixed: HandStatRecord[] = [
    { t: 1000, roomId: 'r1', userId: 'u1', delta: 100, rake: 0, format: 'nlh' },
    { t: 1000, roomId: 'r1', userId: 'u2', delta: -100, rake: 0, format: 'nlh' },
    { t: 2000, roomId: 'r2', userId: 'u1', delta: 50, rake: 5, format: 'shortdeck' },
    { t: 2000, roomId: 'r2', userId: 'u2', delta: -50, rake: 5, format: 'shortdeck' },
    { t: 3000, roomId: 'r3', userId: 'u1', delta: 20, rake: 0 }, // без format → nlh
  ];

  it('aggregateByFormat: NLH и Short Deck считаются раздельно; без format → nlh', () => {
    const res = aggregateByFormat(mixed, null, null);
    // NLH: r1#1000 + r3#3000 = 2 игры, столы r1+r3=2, pnl=100-100+20=20
    expect(res.nlh).toEqual({ games: 2, pnl: 20, rake: 0, tablesActive: 2 });
    // Short Deck: r2#2000 = 1 игра, стол r2=1, pnl=0, rake=10
    expect(res.shortdeck).toEqual({ games: 1, pnl: 0, rake: 10, tablesActive: 1 });
  });

  it('aggregateByFormat: без shortdeck-записей → shortdeck нули', () => {
    const nlhOnly = mixed.filter((r) => r.format !== 'shortdeck');
    const res = aggregateByFormat(nlhOnly, null, null);
    expect(res.shortdeck).toEqual({ games: 0, pnl: 0, rake: 0, tablesActive: 0 });
  });

  it('aggregateByFormat: фильтр по времени работает', () => {
    // since=2000: r2#2000 (shortdeck) + r3#3000 (nlh без format)
    const res = aggregateByFormat(mixed, 2000, null);
    expect(res.nlh).toEqual({ games: 1, pnl: 20, rake: 0, tablesActive: 1 });
    expect(res.shortdeck).toEqual({ games: 1, pnl: 0, rake: 10, tablesActive: 1 });
  });
});

// Минимальный конструктор HandHistoryRecord для тестов HUD-lite.
function makeHand(userId: string, preflopActions: { type: string }[]): HandHistoryRecord {
  return {
    id: 'h1',
    t: Date.now(),
    roomId: 'r1',
    roomName: 'Test',
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    board: [],
    pot: 10,
    rake: 0,
    winners: [userId],
    winAmounts: {},
    players: [{ id: userId, username: 'u', cards: [], folded: false, revealed: false, net: 0 }],
    actions: preflopActions.map(a => ({ phase: 'preflop', playerId: userId, type: a.type })),
  };
}

describe('computeHudStats — HUD-lite (VPIP/PFR)', () => {
  it('0 рук → нули', () => {
    expect(computeHudStats([], 'u1')).toEqual({ vpip: 0, pfr: 0, hands: 0 });
  });

  it('только fold → VPIP=0, PFR=0', () => {
    const h = makeHand('u1', [{ type: 'fold' }]);
    expect(computeHudStats([h], 'u1')).toEqual({ vpip: 0, pfr: 0, hands: 1 });
  });

  it('call → VPIP=100, PFR=0', () => {
    const h = makeHand('u1', [{ type: 'call' }]);
    expect(computeHudStats([h], 'u1')).toEqual({ vpip: 100, pfr: 0, hands: 1 });
  });

  it('raise → VPIP=100, PFR=100', () => {
    const h = makeHand('u1', [{ type: 'raise' }]);
    expect(computeHudStats([h], 'u1')).toEqual({ vpip: 100, pfr: 100, hands: 1 });
  });

  it('all-in → VPIP=100, PFR=100', () => {
    const h = makeHand('u1', [{ type: 'all-in' }]);
    expect(computeHudStats([h], 'u1')).toEqual({ vpip: 100, pfr: 100, hands: 1 });
  });

  it('2 руки: fold + call → VPIP=50, PFR=0', () => {
    const hands = [makeHand('u1', [{ type: 'fold' }]), makeHand('u1', [{ type: 'call' }])];
    expect(computeHudStats(hands, 'u1')).toEqual({ vpip: 50, pfr: 0, hands: 2 });
  });

  it('4 руки: fold/call/raise/raise → VPIP=75, PFR=50', () => {
    const hands = [
      makeHand('u1', [{ type: 'fold' }]),
      makeHand('u1', [{ type: 'call' }]),
      makeHand('u1', [{ type: 'raise' }]),
      makeHand('u1', [{ type: 'raise' }]),
    ];
    expect(computeHudStats(hands, 'u1')).toEqual({ vpip: 75, pfr: 50, hands: 4 });
  });

  it('только bb-check (нет voluntary action) → VPIP=0', () => {
    const h = makeHand('u1', [{ type: 'bb' }, { type: 'check' }]);
    expect(computeHudStats([h], 'u1')).toEqual({ vpip: 0, pfr: 0, hands: 1 });
  });

  it('фильтрует по userId — чужие руки игнорируются', () => {
    const h1 = makeHand('u1', [{ type: 'raise' }]);
    const h2 = makeHand('u2', [{ type: 'call' }]);
    expect(computeHudStats([h1, h2], 'u1')).toEqual({ vpip: 100, pfr: 100, hands: 1 });
  });
});

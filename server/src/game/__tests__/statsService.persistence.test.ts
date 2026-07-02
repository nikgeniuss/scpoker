import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { setStorage, getStorage, clearStorage } from './helpers/storage.js';
import {
  recordHandStat,
  aggregateUserStats,
  aggregateAllUsers,
  getChartData,
  type HandStatRecord,
} from '../statsService.js';

beforeEach(() => clearStorage());

// Кап лога hands.json в коде — см. MAX_RECORDS в statsService.ts (ROADMAP §11.3).
const CAP = 20000;

describe('statsService — lifetime-итоги независимы от обрезки hands.json', () => {
  it('recordHandStat копит lifetime по userId на каждый вызов', () => {
    recordHandStat({ t: 1000, roomId: 'r1', userId: 'u1', delta: 100, rake: 0 });
    recordHandStat({ t: 2000, roomId: 'r1', userId: 'u1', delta: -30, rake: 5 });
    expect(aggregateUserStats('u1', null, null)).toEqual({ hands: 2, pnl: 70, rake: 5 });
    expect(aggregateAllUsers()['u1']).toEqual({ hands: 2, pnl: 70, rake: 5 });
  });

  it('обрезка лога по кап-у не теряет lifetime-итоги', () => {
    // Сидируем лог уже на капе одного юзера (без прохода recordHandStat CAP раз — дорого).
    const seedLog: HandStatRecord[] = Array.from({ length: CAP }, (_, i) => ({
      t: i, roomId: 'r1', userId: 'u1', delta: 1, rake: 0,
    }));
    setStorage('hands.json', seedLog);
    setStorage('handsLifetime.json', { u1: { hands: CAP, pnl: CAP, rake: 0 } });

    recordHandStat({ t: CAP, roomId: 'r1', userId: 'u1', delta: 5, rake: 0 });

    const log = getStorage('hands.json') as HandStatRecord[];
    expect(log).toHaveLength(CAP); // кап не превышен
    expect(log[0].t).toBe(1); // самая старая запись (t=0) выпала
    expect(log[log.length - 1].t).toBe(CAP); // новая запись на месте

    // lifetime учёл все CAP+1 раздач, а не только оставшиеся в (обрезанном) логе.
    expect(aggregateUserStats('u1', null, null)).toEqual({ hands: CAP + 1, pnl: CAP + 5, rake: 0 });
  });

  it('getChartData продолжает кумулятивную линию через точку-якорь после обрезки', () => {
    // В логе остались только 2 последние раздачи, но lifetime знает про более раннюю историю.
    setStorage('hands.json', [
      { t: 100, roomId: 'r1', userId: 'u1', delta: 10, rake: 0 },
      { t: 200, roomId: 'r1', userId: 'u1', delta: -5, rake: 0 },
    ] as HandStatRecord[]);
    setStorage('handsLifetime.json', { u1: { hands: 5, pnl: 55, rake: 0 } }); // +50 из выпавших записей

    expect(getChartData('u1')).toEqual([
      { t: 100, cumPnL: 60 }, // якорь 50 + 10
      { t: 200, cumPnL: 55 }, // итог совпадает с lifetime.pnl
    ]);
  });

  it('getChartData без обрезки — якорь нулевой (как раньше)', () => {
    recordHandStat({ t: 100, roomId: 'r1', userId: 'u1', delta: 10, rake: 0 });
    recordHandStat({ t: 200, roomId: 'r1', userId: 'u1', delta: -5, rake: 0 });
    expect(getChartData('u1')).toEqual([
      { t: 100, cumPnL: 10 },
      { t: 200, cumPnL: 5 },
    ]);
  });
});

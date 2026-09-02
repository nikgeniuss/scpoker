import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage, getStorage } from './helpers/storage.js';
import {
  computeRaceWinners,
  isPeriodElapsed,
  checkAndCloseRace,
  getRaceConfig,
  updateRaceSettings,
  type RacePrizeRow,
  type ScoreEntry,
} from '../raceService.js';
import { getBalance } from '../rewardsWalletService.js';
import { getNotifications } from '../inboxService.js';

const PRIZES: RacePrizeRow[] = [
  { place: 1, amount: 500 },
  { place: 2, amount: 300 },
  { place: 3, amount: 150 },
];

describe('raceService — computeRaceWinners (чистая функция)', () => {
  it('ранжирует по убыванию score, начисляет по призовой таблице', () => {
    const scores: ScoreEntry[] = [
      { userId: 'u1', username: 'alice', score: 100 },
      { userId: 'u2', username: 'bob', score: 300 },
      { userId: 'u3', username: 'carl', score: 200 },
    ];
    expect(computeRaceWinners(scores, PRIZES)).toEqual([
      { userId: 'u2', username: 'bob', place: 1, score: 300, prize: 500 },
      { userId: 'u3', username: 'carl', place: 2, score: 200, prize: 300 },
      { userId: 'u1', username: 'alice', place: 3, score: 100, prize: 150 },
    ]);
  });

  it('score<=0 не участвует', () => {
    const scores: ScoreEntry[] = [
      { userId: 'u1', username: 'alice', score: 0 },
      { userId: 'u2', username: 'bob', score: -50 },
      { userId: 'u3', username: 'carl', score: 10 },
    ];
    expect(computeRaceWinners(scores, PRIZES)).toEqual([
      { userId: 'u3', username: 'carl', place: 1, score: 10, prize: 500 },
    ]);
  });

  it('участников меньше мест — недостающие места пропускаются', () => {
    const scores: ScoreEntry[] = [{ userId: 'u1', username: 'alice', score: 10 }];
    expect(computeRaceWinners(scores, PRIZES)).toEqual([
      { userId: 'u1', username: 'alice', place: 1, score: 10, prize: 500 },
    ]);
  });
});

describe('raceService — isPeriodElapsed (чистая функция)', () => {
  it('true когда прошло ≥ periodDays, иначе false', () => {
    const start = Date.parse('2026-08-01T00:00:00Z');
    expect(isPeriodElapsed(start, 7, start + 6 * 86_400_000)).toBe(false);
    expect(isPeriodElapsed(start, 7, start + 7 * 86_400_000)).toBe(true);
    expect(isPeriodElapsed(start, 7, start + 8 * 86_400_000)).toBe(true);
  });
});

describe('raceService — checkAndCloseRace (файловое состояние)', () => {
  beforeEach(() => clearStorage());

  function seedUsers(): void {
    setStorage('users.json', [
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: 'bob' },
      { id: 'u3', username: 'banned-guy', banned: true },
    ]);
  }

  function seedHands(records: { t: number; userId: string; hands: number; pnl: number }[]): void {
    // statsService читает свой собственный формат лога — эмулируем через aggregateAllUsersInPeriod
    // напрямую засеивая hands.json в формате HandStatRecord (1 запись = 1 рука, delta=pnl своей руки).
    const log = records.flatMap((r) =>
      Array.from({ length: r.hands }, (_, i) => ({ t: r.t + i, roomId: 'room1', userId: r.userId, delta: i === 0 ? r.pnl : 0, rake: 0 })),
    );
    setStorage('hands.json', log);
  }

  it('фича выключена → null, ничего не меняется', () => {
    setStorage('race.json', { enabled: false, metric: 'hands', periodDays: 7, prizeTable: PRIZES, periodStart: 0, history: [] });
    expect(checkAndCloseRace(Date.now())).toBeNull();
  });

  it('период ещё не истёк → null', () => {
    const now = Date.now();
    setStorage('race.json', { enabled: true, metric: 'hands', periodDays: 7, prizeTable: PRIZES, periodStart: now - 86_400_000, history: [] });
    expect(checkAndCloseRace(now)).toBeNull();
  });

  it('период истёк — считает победителей по hands, начисляет HUB-коины, шлёт уведомления, открывает новый период', () => {
    seedUsers();
    const periodStart = Date.parse('2026-08-01T00:00:00Z');
    const now = periodStart + 7 * 86_400_000;
    seedHands([
      { t: periodStart + 1000, userId: 'u1', hands: 50, pnl: 100 },
      { t: periodStart + 2000, userId: 'u2', hands: 20, pnl: 500 },
    ]);
    setStorage('race.json', { enabled: true, metric: 'hands', periodDays: 7, prizeTable: PRIZES, periodStart, history: [] });

    const entry = checkAndCloseRace(now);
    expect(entry).not.toBeNull();
    expect(entry!.winners).toEqual([
      { userId: 'u1', username: 'alice', place: 1, score: 50, prize: 500 },
      { userId: 'u2', username: 'bob', place: 2, score: 20, prize: 300 },
    ]);

    expect(getBalance('u1')).toBe(500);
    expect(getBalance('u2')).toBe(300);
    expect(getNotifications('u1', 5)).toHaveLength(1);
    expect(getNotifications('u1', 5)[0].type).toBe('reward');

    const raw = getStorage('race.json') as { periodStart: number; history: unknown[] };
    expect(raw.periodStart).toBe(now); // новый период открыт
    expect(raw.history).toHaveLength(1);
  });

  it('забаненные пользователи исключены из гонки', () => {
    seedUsers();
    const periodStart = Date.parse('2026-08-01T00:00:00Z');
    const now = periodStart + 7 * 86_400_000;
    seedHands([{ t: periodStart + 1000, userId: 'u3', hands: 999, pnl: 0 }]); // banned-guy
    setStorage('race.json', { enabled: true, metric: 'hands', periodDays: 7, prizeTable: PRIZES, periodStart, history: [] });

    const entry = checkAndCloseRace(now);
    expect(entry!.winners).toEqual([]);
    expect(getBalance('u3')).toBe(0);
  });
});

describe('raceService — настройки', () => {
  beforeEach(() => clearStorage());

  it('updateRaceSettings патчит поля, getRaceConfig не светит history', () => {
    setStorage('race.json', { enabled: false, metric: 'hands', periodDays: 7, prizeTable: PRIZES, periodStart: 0, history: [{ fake: true }] });
    const updated = updateRaceSettings({ enabled: true, metric: 'pnl', periodDays: 3 });
    expect(updated).toMatchObject({ enabled: true, metric: 'pnl', periodDays: 3 });

    const cfg = getRaceConfig();
    expect((cfg as unknown as { history?: unknown }).history).toBeUndefined();
  });
});

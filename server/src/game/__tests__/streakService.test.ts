import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  computeNextStreak,
  rewardForDay,
  processLogin,
  getStreakConfig,
  updateStreakSettings,
  type StreakReward,
} from '../streakService.js';

const REWARDS: StreakReward[] = [
  { day: 1, amount: 10 },
  { day: 2, amount: 20 },
  { day: 3, amount: 30 },
];

function seed(enabled: boolean, rewards: StreakReward[] = REWARDS): void {
  setStorage('streak.json', { enabled, rewards, claimedNetworks: [] });
}

describe('streakService — computeNextStreak (чистая функция)', () => {
  it('первый вход (нет lastLoginDate) → серия 1, isNewDay=true', () => {
    expect(computeNextStreak(undefined, 0, '2026-08-30')).toEqual({ streakDays: 1, isNewDay: true });
  });

  it('тот же календарный день → серия не меняется, isNewDay=false', () => {
    expect(computeNextStreak('2026-08-30', 5, '2026-08-30')).toEqual({ streakDays: 5, isNewDay: false });
  });

  it('ровно вчера → серия +1', () => {
    expect(computeNextStreak('2026-08-29', 5, '2026-08-30')).toEqual({ streakDays: 6, isNewDay: true });
  });

  it('пропуск ≥1 дня → сброс на 1', () => {
    expect(computeNextStreak('2026-08-27', 5, '2026-08-30')).toEqual({ streakDays: 1, isNewDay: true });
  });
});

describe('streakService — rewardForDay (чистая функция)', () => {
  it('возвращает награду по дню, таблица зацикливается после последнего дня', () => {
    expect(rewardForDay(REWARDS, 1)).toBe(10);
    expect(rewardForDay(REWARDS, 3)).toBe(30);
    expect(rewardForDay(REWARDS, 4)).toBe(10); // цикл: день 4 = день 1
    expect(rewardForDay(REWARDS, 7)).toBe(10); // день 7 = день 1 (7-1)%3=0
  });

  it('пустая таблица или день<1 → 0', () => {
    expect(rewardForDay([], 1)).toBe(0);
    expect(rewardForDay(REWARDS, 0)).toBe(0);
  });
});

describe('streakService — processLogin (файловое состояние)', () => {
  beforeEach(() => clearStorage());

  it('фича выключена → null', () => {
    seed(false);
    expect(processLogin('u1', undefined, 0, { ip: '1.1.1.1', deviceId: 'd1' })).toBeNull();
  });

  it('первый вход — day1, награда, не заблокирован', () => {
    seed(true);
    const r = processLogin('u1', undefined, 0, { ip: '1.1.1.1', deviceId: 'd1' }, new Date('2026-08-30T12:00:00Z'));
    expect(r).toEqual({ streakDays: 1, reward: 10, blocked: false });
  });

  it('повторный вход в тот же день — reward=0, серия не растёт', () => {
    seed(true);
    const now = new Date('2026-08-30T12:00:00Z');
    processLogin('u1', undefined, 0, { ip: '1.1.1.1', deviceId: 'd1' }, now);
    const r2 = processLogin('u1', '2026-08-30', 1, { ip: '1.1.1.1', deviceId: 'd1' }, now);
    expect(r2).toEqual({ streakDays: 1, reward: 0, blocked: false });
  });

  it('вход на следующий день — серия растёт, награда за день 2', () => {
    seed(true);
    const r = processLogin(
      'u1',
      '2026-08-29',
      1,
      { ip: '1.1.1.1', deviceId: 'd1' },
      new Date('2026-08-30T12:00:00Z'),
    );
    expect(r).toEqual({ streakDays: 2, reward: 20, blocked: false });
  });

  it('анти-фарм: второй userId с тем же ip/deviceId на day-1 не получает награду', () => {
    seed(true);
    const network = { ip: '9.9.9.9', deviceId: 'shared-device' };
    const r1 = processLogin('u1', undefined, 0, network, new Date('2026-08-30T12:00:00Z'));
    expect(r1).toEqual({ streakDays: 1, reward: 10, blocked: false });

    const r2 = processLogin('u2', undefined, 0, network, new Date('2026-08-30T12:05:00Z'));
    expect(r2).toEqual({ streakDays: 1, reward: 0, blocked: true });
  });

  it('анти-фарм не блокирует ВОЗВРАЩЕНИЕ того же юзера после сброса серии (свой же device)', () => {
    seed(true);
    const network = { ip: '9.9.9.9', deviceId: 'own-device' };
    processLogin('u1', undefined, 0, network, new Date('2026-08-01T12:00:00Z')); // day1, первый раз
    // Пропуск много дней → серия сбрасывается на 1 у ТОГО ЖЕ юзера — не должно блокироваться.
    const r = processLogin('u1', '2026-08-01', 1, network, new Date('2026-08-30T12:00:00Z'));
    expect(r).toEqual({ streakDays: 1, reward: 10, blocked: false });
  });

  it('анти-фарм не срабатывает при пустых ip/deviceId (не определены)', () => {
    seed(true);
    processLogin('u1', undefined, 0, { ip: '', deviceId: '' }, new Date('2026-08-30T12:00:00Z'));
    const r2 = processLogin('u2', undefined, 0, { ip: '', deviceId: '' }, new Date('2026-08-30T12:05:00Z'));
    expect(r2).toEqual({ streakDays: 1, reward: 10, blocked: false });
  });
});

describe('streakService — настройки', () => {
  beforeEach(() => clearStorage());

  it('updateStreakSettings патчит enabled/rewards, getStreakConfig не светит claimedNetworks', () => {
    setStorage('streak.json', {
      enabled: false,
      rewards: REWARDS,
      claimedNetworks: [{ ip: 'secret', deviceId: 'x', userId: 'u1', t: 1 }],
    });
    const updated = updateStreakSettings({ enabled: true });
    expect(updated.enabled).toBe(true);
    expect(updated.rewards).toEqual(REWARDS);

    const cfg = getStreakConfig();
    expect(cfg).toEqual({ enabled: true, rewards: REWARDS });
    expect((cfg as unknown as { claimedNetworks?: unknown }).claimedNetworks).toBeUndefined();
  });

  it('updateStreakSettings сортирует rewards по дню', () => {
    const unsorted = [REWARDS[2], REWARDS[0], REWARDS[1]];
    const updated = updateStreakSettings({ rewards: unsorted });
    expect(updated.rewards.map((r) => r.day)).toEqual([1, 2, 3]);
  });
});

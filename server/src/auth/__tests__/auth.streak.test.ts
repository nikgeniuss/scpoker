import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage } from '../../game/__tests__/helpers/storage.js';
import { loginUser, type User } from '../auth.js';
import { getBalance } from '../../game/rewardsWalletService.js';
import { getNotifications } from '../../game/inboxService.js';

// Интеграционные тесты визит-бонуса/стрика (ROADMAP §10.21.2) — врезка в loginUser (auth.ts
// applyLoginStreak). Чистая логика серии/анти-фарма уже покрыта streakService.test.ts; здесь —
// вся цепочка через реальный вход: streakService.processLogin → HUB-коины в кошелёк + уведомление.

function seedUser(overrides: Partial<User> = {}): User {
  const u = {
    id: 'u1',
    username: 'alice',
    email: 'alice@test.local',
    passwordHash: bcrypt.hashSync('pw12345', 4),
    role: 'player',
    chips: 1000,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as User;
  setStorage('users.json', [u]);
  return u;
}

function seedStreak(enabled: boolean, rewards = [{ day: 1, amount: 10 }, { day: 2, amount: 20 }]): void {
  setStorage('streak.json', { enabled, rewards, claimedNetworks: [] });
}

beforeEach(() => clearStorage());

describe('auth — визит-бонус/стрик при логине', () => {
  it('фича выключена (дефолт) — вход работает как обычно, HUB-коины не начисляются', () => {
    seedUser();
    const r = loginUser('alice', 'pw12345', { ip: '1.1.1.1', deviceId: 'd1' });
    expect('token' in r).toBe(true);
    expect(getBalance('u1')).toBe(0);
    expect(getNotifications('u1', 5)).toHaveLength(0);
  });

  it('первый вход — day1, HUB-коины начислены, уведомление отправлено', () => {
    seedUser();
    seedStreak(true);
    const r = loginUser('alice', 'pw12345', { ip: '1.1.1.1', deviceId: 'd1' });
    expect('token' in r).toBe(true);
    expect(getBalance('u1')).toBe(10);
    const notes = getNotifications('u1', 5);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('reward');
    expect(notes[0].text).toContain('10');
  });

  it('второй вход в тот же день — повторно не начисляет', () => {
    seedUser();
    seedStreak(true);
    loginUser('alice', 'pw12345', { ip: '1.1.1.1', deviceId: 'd1' });
    loginUser('alice', 'pw12345', { ip: '1.1.1.1', deviceId: 'd1' });
    expect(getBalance('u1')).toBe(10); // не удвоилось
    expect(getNotifications('u1', 5)).toHaveLength(1);
  });

  it('анти-фарм: второй аккаунт с того же устройства не получает day-1 бонус', () => {
    seedUser({ id: 'u1', username: 'alice' });
    seedStreak(true);
    loginUser('alice', 'pw12345', { ip: '9.9.9.9', deviceId: 'shared' });

    // Второй юзер с тем же device/ip
    setStorage('users.json', [
      { id: 'u1', username: 'alice', email: 'a@t.local', passwordHash: bcrypt.hashSync('pw12345', 4), role: 'player', chips: 1000, createdAt: new Date().toISOString() },
      { id: 'u2', username: 'bob', email: 'b@t.local', passwordHash: bcrypt.hashSync('pw12345', 4), role: 'player', chips: 1000, createdAt: new Date().toISOString() },
    ] as User[]);
    loginUser('bob', 'pw12345', { ip: '9.9.9.9', deviceId: 'shared' });

    expect(getBalance('u1')).toBe(10);
    expect(getBalance('u2')).toBe(0); // заблокирован анти-фармом
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';

// Тот же in-memory мок storage, что у остальных auth-тестов.
vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { clearStorage, readJSON, setStorage } from '../../game/__tests__/helpers/storage.js';
import {
  loginUser,
  loginOrRegisterTelegramUser,
  completeTwoFactorLogin,
  completeDobGate,
  type User,
} from '../auth.js';
import { generateTotp } from '../totp.js';

// Возрастной гейт 18+ (§11.2). Ключевое: вход через Telegram больше НЕ создаёт аккаунт до
// подтверждения возраста, а аккаунты без даты рождения дозаполняют её при следующем входе.

const ADULT = '1990-01-01';
const CHILD = new Date(Date.now() - 10 * 365 * 24 * 3600_000).toISOString().slice(0, 10);

beforeEach(() => {
  clearStorage();
  setStorage('users.json', []);
});

function users(): User[] {
  return readJSON('users.json') as User[];
}

function seedPasswordUser(overrides: Partial<User> = {}): void {
  setStorage('users.json', [
    {
      id: 'u1',
      username: 'alice',
      email: 'a@a.com',
      passwordHash: bcrypt.hashSync('pw12345', 4),
      role: 'player',
      chips: 1000,
      createdAt: new Date().toISOString(),
      ...overrides,
    } as User,
  ]);
}

describe('возрастной гейт — вход через Telegram', () => {
  it('первый вход НЕ создаёт аккаунт, а требует дату рождения', () => {
    const r = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' });
    expect(r && 'dobRequired' in r).toBe(true);
    expect(users()).toHaveLength(0); // аккаунт не заведён — гейт не обойти
  });

  it('совершеннолетний на шаге 2 — аккаунт создаётся с датой рождения и получает токен', () => {
    const gate = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' }) as { pendingToken: string };
    const r = completeDobGate(gate.pendingToken, ADULT);
    expect('token' in r).toBe(true);
    const stored = users();
    expect(stored).toHaveLength(1);
    expect(stored[0].telegramId).toBe(777);
    expect(stored[0].dateOfBirth).toBe(ADULT);
  });

  it('несовершеннолетний — аккаунта не появляется вовсе', () => {
    const gate = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' }) as { pendingToken: string };
    const r = completeDobGate(gate.pendingToken, CHILD);
    expect(r).toEqual({ error: 'underage' });
    expect(users()).toHaveLength(0);
  });

  it('некорректная дата — аккаунта не появляется', () => {
    const gate = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' }) as { pendingToken: string };
    expect(completeDobGate(gate.pendingToken, '01-01-1990')).toEqual({ error: 'invalid-dob' });
    expect(users()).toHaveLength(0);
  });

  it('существующий TG-аккаунт без даты — дозаполняет её, второй аккаунт не заводится', () => {
    setStorage('users.json', [
      { id: 'tg1', username: 'tguser', email: 'tg-777@telegram.local', passwordHash: '', role: 'player', chips: 500, createdAt: new Date().toISOString(), telegramId: 777 } as User,
    ]);
    const gate = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' }) as { pendingToken: string };
    expect(gate.pendingToken).toBeTruthy();

    const r = completeDobGate(gate.pendingToken, ADULT);
    expect('token' in r).toBe(true);
    const stored = users();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('tg1');
    expect(stored[0].dateOfBirth).toBe(ADULT);
    expect(stored[0].chips).toBe(500); // существующий баланс не тронут
  });

  it('TG-аккаунт с подтверждённым возрастом входит как раньше, без гейта', () => {
    setStorage('users.json', [
      { id: 'tg1', username: 'tguser', email: 'tg-777@telegram.local', passwordHash: '', role: 'player', chips: 500, createdAt: new Date().toISOString(), telegramId: 777, dateOfBirth: ADULT } as User,
    ]);
    const r = loginOrRegisterTelegramUser({ id: 777, username: 'tguser' });
    expect(r && 'token' in r).toBe(true);
  });

  it('забаненный TG-аккаунт по-прежнему получает отказ (null), а не гейт', () => {
    setStorage('users.json', [
      { id: 'tg1', username: 'tguser', email: 'tg-777@telegram.local', passwordHash: '', role: 'player', chips: 0, createdAt: new Date().toISOString(), telegramId: 777, dateOfBirth: ADULT, banned: true } as User,
    ]);
    expect(loginOrRegisterTelegramUser({ id: 777, username: 'tguser' })).toBeNull();
  });
});

describe('возрастной гейт — вход паролем', () => {
  it('аккаунт без даты рождения не получает токен сразу', () => {
    seedPasswordUser();
    const r = loginUser('alice', 'pw12345');
    expect('dobRequired' in r).toBe(true);
    expect('token' in r).toBe(false);
  });

  it('после доввода даты — токен выдан, дата сохранена в аккаунте', () => {
    seedPasswordUser();
    const gate = loginUser('alice', 'pw12345') as { pendingToken: string };
    const r = completeDobGate(gate.pendingToken, ADULT);
    expect('token' in r).toBe(true);
    expect(users()[0].dateOfBirth).toBe(ADULT);
  });

  it('несовершеннолетний по паролю — токена нет, дата не записывается', () => {
    seedPasswordUser();
    const gate = loginUser('alice', 'pw12345') as { pendingToken: string };
    expect(completeDobGate(gate.pendingToken, CHILD)).toEqual({ error: 'underage' });
    expect(users()[0].dateOfBirth).toBeUndefined();
  });

  it('самоисключение отбивает вход и на шаге доввода даты', () => {
    seedPasswordUser();
    const gate = loginUser('alice', 'pw12345') as { pendingToken: string };
    // Самоисключение включено между шагами — второй шаг не должен его обойти.
    setStorage('users.json', [
      { ...users()[0], responsibleGambling: { selfExcludedUntil: 'permanent' } } as User,
    ]);
    const r = completeDobGate(gate.pendingToken, ADULT);
    expect('error' in r && r.error).toBe('self-excluded');
  });

  it('2FA идёт первой, дата рождения — после кода', () => {
    const secret = 'AAAAAAAAAAAAAAAA';
    seedPasswordUser({ twoFactorEnabled: true, twoFactorSecret: secret });
    const first = loginUser('alice', 'pw12345');
    expect('twoFactorRequired' in first).toBe(true);

    const second = completeTwoFactorLogin(
      (first as { pendingToken: string }).pendingToken,
      generateTotp(secret),
    );
    expect('dobRequired' in second).toBe(true);

    const third = completeDobGate((second as { pendingToken: string }).pendingToken, ADULT);
    expect('token' in third).toBe(true);
  });

  it('подделанный pendingToken отбивается', () => {
    seedPasswordUser();
    expect(completeDobGate('not-a-jwt', ADULT)).toEqual({ error: 'invalid-token' });
  });
});

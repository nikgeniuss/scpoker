import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage } from '../../game/__tests__/helpers/storage.js';
import {
  loginUser,
  setSelfExclusion,
  setAccountTimeout,
  getResponsibleGamblingState,
  setResponsibleGamblingLimits,
  markResponsibleGamblingWarned,
} from '../auth.js';

interface MinimalUser {
  id: string;
  username: string;
  passwordHash: string;
  dateOfBirth?: string;
  banned?: boolean;
  responsibleGambling?: Record<string, unknown>;
}

beforeEach(() => clearStorage());

function seedUser(overrides: Partial<MinimalUser> = {}): MinimalUser {
  const u: MinimalUser = {
    id: 'u1',
    username: 'alice',
    passwordHash: bcrypt.hashSync('pw12345', 4),
    // Возрастной гейт 18+ (§11.2): без даты рождения вход уходит на её доввод, а здесь
    // проверяются блокировки — юзер должен быть уже с подтверждённым возрастом.
    dateOfBirth: '1990-01-01',
    ...overrides,
  };
  setStorage('users.json', [u]);
  return u;
}

describe('setSelfExclusion / setAccountTimeout', () => {
  it('активирует самоисключение', () => {
    seedUser();
    const r = setSelfExclusion('u1', '2027-01-01T00:00:00.000Z');
    expect(r).toEqual({ ok: true });
    expect(getResponsibleGamblingState('u1').selfExcludedUntil).toBe('2027-01-01T00:00:00.000Z');
  });

  it('повторная активация — already-active, пока не истёк срок', () => {
    seedUser();
    setSelfExclusion('u1', '2099-01-01T00:00:00.000Z');
    const r = setSelfExclusion('u1', '2099-06-01T00:00:00.000Z');
    expect(r).toEqual({ error: 'already-active' });
  });

  it('permanent самоисключение тоже блокирует повторную активацию', () => {
    seedUser();
    setSelfExclusion('u1', 'permanent');
    const r = setSelfExclusion('u1', '2099-01-01T00:00:00.000Z');
    expect(r).toEqual({ error: 'already-active' });
  });

  it('после истечения срока самоисключение можно активировать снова', () => {
    seedUser({ responsibleGambling: { selfExcludedUntil: '2000-01-01T00:00:00.000Z' } });
    const r = setSelfExclusion('u1', '2099-01-01T00:00:00.000Z');
    expect(r).toEqual({ ok: true });
  });

  it('not-found для неизвестного юзера', () => {
    seedUser();
    expect(setSelfExclusion('ghost', 'permanent')).toEqual({ error: 'not-found' });
  });

  it('тайм-аут: та же защита от повторной активации', () => {
    seedUser();
    setAccountTimeout('u1', '2099-01-01T00:00:00.000Z');
    expect(setAccountTimeout('u1', '2099-02-01T00:00:00.000Z')).toEqual({ error: 'already-active' });
  });
});

describe('setResponsibleGamblingLimits / markResponsibleGamblingWarned', () => {
  it('частично обновляет лимиты, не трогая остальные поля', () => {
    seedUser({ responsibleGambling: { selfExcludedUntil: 'permanent' } });
    setResponsibleGamblingLimits('u1', { lossLimitCents: 5000, lossLimitPeriod: 'week' });
    const rg = getResponsibleGamblingState('u1');
    expect(rg.lossLimitCents).toBe(5000);
    expect(rg.lossLimitPeriod).toBe('week');
    expect(rg.selfExcludedUntil).toBe('permanent');
  });

  it('markResponsibleGamblingWarned пишет periodKey для дедупа', () => {
    seedUser();
    markResponsibleGamblingWarned('u1', 'loss', 'd:2026-06-26');
    expect(getResponsibleGamblingState('u1').lossWarnedPeriodKey).toBe('d:2026-06-26');
    markResponsibleGamblingWarned('u1', 'deposit', 'd:2026-06-26');
    expect(getResponsibleGamblingState('u1').depositWarnedPeriodKey).toBe('d:2026-06-26');
  });
});

describe('loginUser — блокировка по banned/self-excluded/timeout', () => {
  it('обычный логин — успех', () => {
    seedUser();
    const r = loginUser('alice', 'pw12345');
    expect('token' in r).toBe(true);
  });

  it('неверный пароль — invalid', () => {
    seedUser();
    expect(loginUser('alice', 'wrong')).toEqual({ error: 'invalid' });
  });

  it('banned блокирует логин', () => {
    seedUser({ banned: true });
    expect(loginUser('alice', 'pw12345')).toEqual({ error: 'banned' });
  });

  it('активное самоисключение блокирует логин с until', () => {
    seedUser({ responsibleGambling: { selfExcludedUntil: '2099-01-01T00:00:00.000Z' } });
    expect(loginUser('alice', 'pw12345')).toEqual({ error: 'self-excluded', until: '2099-01-01T00:00:00.000Z' });
  });

  it('активный тайм-аут блокирует логин с until', () => {
    seedUser({ responsibleGambling: { timeoutUntil: '2099-01-01T00:00:00.000Z' } });
    expect(loginUser('alice', 'pw12345')).toEqual({ error: 'timeout', until: '2099-01-01T00:00:00.000Z' });
  });

  it('истёкший тайм-аут больше не блокирует логин', () => {
    seedUser({ responsibleGambling: { timeoutUntil: '2000-01-01T00:00:00.000Z' } });
    const r = loginUser('alice', 'pw12345');
    expect('token' in r).toBe(true);
  });

  it('banned приоритетнее активного самоисключения', () => {
    seedUser({ banned: true, responsibleGambling: { selfExcludedUntil: 'permanent' } });
    expect(loginUser('alice', 'pw12345')).toEqual({ error: 'banned' });
  });

  it('permanent самоисключение блокирует логин навсегда', () => {
    seedUser({ responsibleGambling: { selfExcludedUntil: 'permanent' } });
    expect(loginUser('alice', 'pw12345')).toEqual({ error: 'self-excluded', until: 'permanent' });
  });
});

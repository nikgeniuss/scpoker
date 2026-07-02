import { describe, it, expect, beforeEach, vi } from 'vitest';

// Тот же in-memory мок storage, что у GameManager/clubService тестов (helpers/storage.ts).
vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { clearStorage, readJSON, setStorage } from '../../game/__tests__/helpers/storage.js';
import { registerUser, isAdult, isValidDateOfBirth, type User } from '../auth.js';

beforeEach(() => {
  clearStorage();
  setStorage('users.json', []);
});

describe('isAdult', () => {
  const now = new Date('2026-07-02T12:00:00Z');

  it('18-летие сегодня — совершеннолетний', () => {
    expect(isAdult('2008-07-02', now)).toBe(true);
  });

  it('18-летие завтра — ещё нет', () => {
    expect(isAdult('2008-07-03', now)).toBe(false);
  });

  it('17 лет — несовершеннолетний', () => {
    expect(isAdult('2009-01-01', now)).toBe(false);
  });

  it('30 лет — совершеннолетний', () => {
    expect(isAdult('1996-01-01', now)).toBe(true);
  });
});

describe('isValidDateOfBirth', () => {
  const now = new Date('2026-07-02T12:00:00Z');

  it('корректная дата в прошлом — валидна', () => {
    expect(isValidDateOfBirth('1990-05-20', now)).toBe(true);
  });

  it('неверный формат — невалидна', () => {
    expect(isValidDateOfBirth('20-05-1990', now)).toBe(false);
    expect(isValidDateOfBirth('not-a-date', now)).toBe(false);
  });

  it('дата в будущем — невалидна', () => {
    expect(isValidDateOfBirth('2030-01-01', now)).toBe(false);
  });

  it('нереалистично старая дата (>120 лет) — невалидна', () => {
    expect(isValidDateOfBirth('1900-01-01', now)).toBe(false);
  });
});

describe('registerUser — возрастная проверка (KYC-basic, §11.2)', () => {
  it('несовершеннолетний — отбивается error underage, пользователь не создаётся', () => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);
    const dob = minorDob.toISOString().slice(0, 10);

    const result = registerUser('minor', 'password123', 'minor@a.com', dob);
    expect(result).toEqual({ error: 'underage' });
    const users = readJSON('users.json') as User[];
    expect(users.find((u) => u.username === 'minor')).toBeUndefined();
  });

  it('некорректная дата рождения — error invalid-dob', () => {
    const result = registerUser('bob', 'password123', 'bob@a.com', 'garbage');
    expect(result).toEqual({ error: 'invalid-dob' });
  });

  it('совершеннолетний — создаётся с dateOfBirth', () => {
    const result = registerUser('alice', 'password123', 'alice@a.com', '1990-01-01');
    expect('user' in result && result.user.dateOfBirth).toBe('1990-01-01');
    const users = readJSON('users.json') as User[];
    expect(users.find((u) => u.username === 'alice')?.dateOfBirth).toBe('1990-01-01');
  });

  it('занятый username — error username-taken (проверяется после возраста)', () => {
    registerUser('alice', 'password123', 'alice@a.com', '1990-01-01');
    const result = registerUser('alice', 'password123', 'other@a.com', '1990-01-01');
    expect(result).toEqual({ error: 'username-taken' });
  });

  it('занятый email — error email-taken', () => {
    registerUser('alice', 'password123', 'alice@a.com', '1990-01-01');
    const result = registerUser('bob', 'password123', 'alice@a.com', '1990-01-01');
    expect(result).toEqual({ error: 'email-taken' });
  });
});

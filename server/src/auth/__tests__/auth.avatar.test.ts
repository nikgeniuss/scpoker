import { describe, it, expect, beforeEach, vi } from 'vitest';

// Тот же in-memory мок storage, что у GameManager/clubService тестов (helpers/storage.ts).
vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage, readJSON } from '../../game/__tests__/helpers/storage.js';
import { setAvatarSeed } from '../auth.js';

interface MinimalUser {
  id: string;
  avatarSeed?: string;
}

beforeEach(() => clearStorage());

function seedUsers(users: MinimalUser[]): void {
  setStorage('users.json', users);
}

describe('setAvatarSeed', () => {
  it('сохраняет выбранный seed и возвращает true', () => {
    seedUsers([{ id: 'u1' }]);
    const ok = setAvatarSeed('u1', 'av-07');
    expect(ok).toBe(true);
    const users = readJSON('users.json') as MinimalUser[];
    expect(users.find((u) => u.id === 'u1')?.avatarSeed).toBe('av-07');
  });

  it('перезаписывает ранее выбранный seed', () => {
    seedUsers([{ id: 'u1', avatarSeed: 'av-01' }]);
    setAvatarSeed('u1', 'av-12');
    const users = readJSON('users.json') as MinimalUser[];
    expect(users.find((u) => u.id === 'u1')?.avatarSeed).toBe('av-12');
  });

  it('не затрагивает аватары других юзеров', () => {
    seedUsers([{ id: 'u1' }, { id: 'u2', avatarSeed: 'av-05' }]);
    setAvatarSeed('u1', 'av-09');
    const users = readJSON('users.json') as MinimalUser[];
    expect(users.find((u) => u.id === 'u2')?.avatarSeed).toBe('av-05');
  });

  it('неизвестный юзер — no-op, возвращает false', () => {
    seedUsers([{ id: 'u1' }]);
    const ok = setAvatarSeed('ghost', 'av-01');
    expect(ok).toBe(false);
  });
});

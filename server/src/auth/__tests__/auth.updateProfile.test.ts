import { describe, it, expect, beforeEach, vi } from 'vitest';

// Тот же in-memory мок storage, что у GameManager/clubService тестов (helpers/storage.ts).
vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage, readJSON } from '../../game/__tests__/helpers/storage.js';
import { updateUsername, updateEmail } from '../auth.js';

interface MinimalUser {
  id: string;
  username: string;
  email: string;
}

beforeEach(() => clearStorage());

function seedUsers(users: MinimalUser[]): void {
  setStorage('users.json', users);
}

describe('updateUsername', () => {
  it('меняет имя пользователя и возвращает обновлённого юзера', () => {
    seedUsers([{ id: 'u1', username: 'old', email: 'a@a.com' }]);
    const result = updateUsername('u1', 'newname');
    expect('user' in result && result.user.username).toBe('newname');
    const users = readJSON('users.json') as MinimalUser[];
    expect(users.find((u) => u.id === 'u1')?.username).toBe('newname');
  });

  it('отбивает занятое другим юзером имя', () => {
    seedUsers([
      { id: 'u1', username: 'alice', email: 'a@a.com' },
      { id: 'u2', username: 'bob', email: 'b@b.com' },
    ]);
    const result = updateUsername('u2', 'alice');
    expect(result).toEqual({ error: 'taken' });
  });

  it('разрешает переименовать в то же самое имя (без коллизии с собой)', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'a@a.com' }]);
    const result = updateUsername('u1', 'alice');
    expect('user' in result && result.user.username).toBe('alice');
  });

  it('отбивает слишком короткое/длинное имя', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'a@a.com' }]);
    expect(updateUsername('u1', 'ab')).toEqual({ error: 'invalid' });
    expect(updateUsername('u1', 'x'.repeat(33))).toEqual({ error: 'invalid' });
  });

  it('неизвестный юзер — error invalid', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'a@a.com' }]);
    expect(updateUsername('ghost', 'newname')).toEqual({ error: 'invalid' });
  });
});

describe('updateEmail', () => {
  it('меняет email и возвращает обновлённого юзера', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'old@a.com' }]);
    const result = updateEmail('u1', 'new@a.com');
    expect('user' in result && result.user.email).toBe('new@a.com');
    const users = readJSON('users.json') as MinimalUser[];
    expect(users.find((u) => u.id === 'u1')?.email).toBe('new@a.com');
  });

  it('отбивает занятый другим юзером email', () => {
    seedUsers([
      { id: 'u1', username: 'alice', email: 'a@a.com' },
      { id: 'u2', username: 'bob', email: 'b@b.com' },
    ]);
    const result = updateEmail('u2', 'a@a.com');
    expect(result).toEqual({ error: 'taken' });
  });

  it('отбивает некорректный формат email', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'a@a.com' }]);
    expect(updateEmail('u1', 'not-an-email')).toEqual({ error: 'invalid' });
  });

  it('неизвестный юзер — error invalid', () => {
    seedUsers([{ id: 'u1', username: 'alice', email: 'a@a.com' }]);
    expect(updateEmail('ghost', 'new@a.com')).toEqual({ error: 'invalid' });
  });
});

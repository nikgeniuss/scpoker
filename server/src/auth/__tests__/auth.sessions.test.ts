import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage } from '../../game/__tests__/helpers/storage.js';
import { loginUser, loginOrRegisterTelegramUser } from '../auth.js';
import { listSessions, isSessionValid } from '../sessionStore.js';
import { JWT_SECRET } from '../../config.js';

interface MinimalUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
}

beforeEach(() => clearStorage());

function decodeSid(token: string): string | undefined {
  return (jwt.verify(token, JWT_SECRET) as { sid?: string }).sid;
}

describe('loginUser — создание сессии («Мои устройства», §10.15)', () => {
  it('успешный логин создаёт запись сессии с device info, sid в токене совпадает', () => {
    setStorage('users.json', [
      { id: 'u1', username: 'alice', email: 'a@a.com', passwordHash: bcrypt.hashSync('secret123', 10) } as MinimalUser,
    ]);
    const result = loginUser('alice', 'secret123', { userAgent: 'Mozilla/5.0', ip: '1.2.3.4' });
    expect('token' in result).toBe(true);
    const token = (result as { token: string }).token;
    const sid = decodeSid(token);
    expect(sid).toBeTruthy();
    expect(isSessionValid(sid!)).toBe(true);

    const sessions = listSessions('u1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sid, userId: 'u1', userAgent: 'Mozilla/5.0', ip: '1.2.3.4' });
  });

  it('без device info создаёт сессию с пустыми userAgent/ip, но не падает', () => {
    setStorage('users.json', [
      { id: 'u1', username: 'alice', email: 'a@a.com', passwordHash: bcrypt.hashSync('secret123', 10) } as MinimalUser,
    ]);
    const result = loginUser('alice', 'secret123');
    expect('token' in result).toBe(true);
    expect(listSessions('u1')).toHaveLength(1);
  });
});

describe('loginOrRegisterTelegramUser — создание сессии', () => {
  it('новый TG-юзер получает sid в токене и запись в sessions.json', () => {
    setStorage('users.json', []);
    const result = loginOrRegisterTelegramUser({ id: 555, username: 'tguser' }, { userAgent: 'TelegramBot', ip: '5.5.5.5' });
    expect(result).not.toBeNull();
    const sid = decodeSid(result!.token);
    expect(sid).toBeTruthy();
    expect(isSessionValid(sid!)).toBe(true);
    const sessions = listSessions(result!.user.id);
    expect(sessions[0].userAgent).toBe('TelegramBot');
  });
});

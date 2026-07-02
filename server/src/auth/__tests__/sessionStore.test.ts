import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage, getStorage } from '../../game/__tests__/helpers/storage.js';
import { createSession, isSessionValid, listSessions, revokeSession, type SessionRecord } from '../sessionStore.js';

beforeEach(() => clearStorage());

describe('createSession / isSessionValid', () => {
  it('новая сессия валидна сразу после создания', () => {
    const sid = createSession('u1', 'Mozilla/5.0', '127.0.0.1');
    expect(isSessionValid(sid)).toBe(true);
  });

  it('случайный sid не валиден', () => {
    expect(isSessionValid('ghost-sid')).toBe(false);
  });
});

describe('listSessions', () => {
  it('возвращает только сессии указанного юзера, новые сверху', () => {
    const sidOld = createSession('u1', 'ua-old', '1.1.1.1');
    // createdAt совпадает по времени в тесте — подменим вручную порядок через storage для детерминизма
    const sessions = getStorage('sessions.json') as SessionRecord[];
    sessions[0].createdAt = new Date(Date.now() - 60_000).toISOString();
    setStorage('sessions.json', sessions);

    const sidNew = createSession('u1', 'ua-new', '2.2.2.2');
    createSession('u2', 'ua-other', '3.3.3.3');

    const list = listSessions('u1');
    expect(list.map((s) => s.sid)).toEqual([sidNew, sidOld]);
    expect(list.every((s) => s.userId === 'u1')).toBe(true);
  });

  it('прунит записи старше TTL (7 дней)', () => {
    createSession('u1', 'ua', '1.1.1.1');
    const sessions = getStorage('sessions.json') as SessionRecord[];
    sessions[0].createdAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    setStorage('sessions.json', sessions);

    expect(listSessions('u1')).toHaveLength(0);
  });
});

describe('revokeSession', () => {
  it('удаляет сессию владельца — после revoke isSessionValid возвращает false', () => {
    const sid = createSession('u1', 'ua', '1.1.1.1');
    expect(revokeSession('u1', sid)).toBe(true);
    expect(isSessionValid(sid)).toBe(false);
  });

  it('не даёт отозвать чужую сессию', () => {
    const sid = createSession('u1', 'ua', '1.1.1.1');
    expect(revokeSession('u2', sid)).toBe(false);
    expect(isSessionValid(sid)).toBe(true);
  });

  it('несуществующий sid — false', () => {
    expect(revokeSession('u1', 'ghost')).toBe(false);
  });
});

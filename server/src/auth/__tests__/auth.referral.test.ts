import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { clearStorage, setStorage } from '../../game/__tests__/helpers/storage.js';
import { registerUser } from '../auth.js';
import { getOrCreateCode, getUserReferralInfo } from '../../game/referralService.js';

beforeEach(() => clearStorage());

function seedReferrer(id: string, regIp: string, regDeviceId: string): void {
  setStorage('users.json', [
    { id, username: 'referrer', email: 'r@t.local', passwordHash: 'x', role: 'player', chips: 1000, createdAt: new Date().toISOString(), regIp, regDeviceId },
  ]);
}

describe('auth — реферальная привязка при регистрации', () => {
  it('регистрация с валидным кодом привязывает newUser к рефереру, без коллизии сети', () => {
    seedReferrer('referrer1', '1.1.1.1', 'dRef');
    const code = getOrCreateCode('referrer1');

    const result = registerUser(
      'newbie',
      'password1',
      'newbie@test.local',
      '2000-01-01',
      { ip: '2.2.2.2', deviceId: 'dNew' },
      code,
    );
    expect('user' in result).toBe(true);

    const info = getUserReferralInfo('referrer1');
    expect(info.invitedCount).toBe(1);
    expect(info.pendingCount).toBe(1);
  });

  it('невалидный код молча игнорируется — регистрация не падает', () => {
    setStorage('users.json', []);
    const result = registerUser('newbie', 'password1', 'newbie@test.local', '2000-01-01', {}, 'GHOST1');
    expect('user' in result).toBe(true);
  });

  it('регистрация с того же устройства, что и у реферера — связь создаётся, но блокируется анти-фармом', () => {
    seedReferrer('referrer1', '9.9.9.9', 'sharedDevice');
    const code = getOrCreateCode('referrer1');

    registerUser('altAccount', 'password1', 'alt@test.local', '2000-01-01', { ip: '9.9.9.9', deviceId: 'sharedDevice' }, code);

    const info = getUserReferralInfo('referrer1');
    expect(info.invitedCount).toBe(1);
    expect(info.pendingCount).toBe(0); // заблокирован, не «в ожидании»
  });

  it('без refCode — регистрация обычная, реферальная связь не создаётся', () => {
    setStorage('users.json', []);
    registerUser('solo', 'password1', 'solo@test.local', '2000-01-01');
    // getUserReferralInfo('solo') создаёт код, но invitedCount у НЕГО (как у реферера) — 0.
    const info = getUserReferralInfo('solo');
    expect(info.invitedCount).toBe(0);
  });
});

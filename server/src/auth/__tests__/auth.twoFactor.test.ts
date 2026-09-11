import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

vi.mock('../storage.js', () => import('../../game/__tests__/helpers/storage.js'));

import { setStorage, clearStorage, readJSON } from '../../game/__tests__/helpers/storage.js';
import {
  setupTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  adminDisableTwoFactor,
  loginUser,
  completeTwoFactorLogin,
} from '../auth.js';
import { generateTotp } from '../totp.js';

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorPendingSecret?: string;
  twoFactorBackupCodeHashes?: string[];
}

beforeEach(() => clearStorage());

function seedUser(overrides: Partial<StoredUser> = {}): StoredUser {
  const user: StoredUser = {
    id: 'u1',
    username: 'alice',
    email: 'a@a.com',
    passwordHash: bcrypt.hashSync('secret123', 10),
    // Возрастной гейт 18+ (§11.2): без даты рождения вход уходит на её доввод, а здесь
    // проверяется 2FA — юзер должен быть уже с подтверждённым возрастом.
    dateOfBirth: '1990-01-01',
    ...overrides,
  };
  setStorage('users.json', [user]);
  return user;
}

describe('setupTwoFactor / confirmTwoFactor', () => {
  it('setup создаёт pending-секрет, не активируя 2FA', () => {
    seedUser();
    const result = setupTwoFactor('u1');
    expect('secret' in result).toBe(true);
    const stored = (readJSON('users.json') as StoredUser[])[0];
    expect(stored.twoFactorPendingSecret).toBeTruthy();
    expect(stored.twoFactorEnabled).toBeFalsy();
  });

  it('setup отбивает повторный запрос при уже включённой 2FA', () => {
    seedUser({ twoFactorEnabled: true, twoFactorSecret: 'AAAAAAAAAAAAAAAA' });
    expect(setupTwoFactor('u1')).toEqual({ error: 'already-enabled' });
  });

  it('confirm с верным кодом активирует 2FA и выдаёт 8 backup-кодов', () => {
    seedUser();
    setupTwoFactor('u1');
    const pendingSecret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    const code = generateTotp(pendingSecret);
    const result = confirmTwoFactor('u1', code);
    expect('backupCodes' in result && result.backupCodes).toHaveLength(8);
    const stored = (readJSON('users.json') as StoredUser[])[0];
    expect(stored.twoFactorEnabled).toBe(true);
    expect(stored.twoFactorSecret).toBe(pendingSecret);
    expect(stored.twoFactorPendingSecret).toBeUndefined();
    expect(stored.twoFactorBackupCodeHashes).toHaveLength(8);
  });

  it('backup-коды генерируются crypto.randomInt, не Math.random (security review 2026-08-23: backup-код обходит 2FA, должен быть непредсказуем)', () => {
    seedUser();
    setupTwoFactor('u1');
    const pendingSecret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    const code = generateTotp(pendingSecret);
    const randomIntSpy = vi.spyOn(crypto, 'randomInt');
    const mathRandomSpy = vi.spyOn(Math, 'random');
    try {
      confirmTwoFactor('u1', code);
      expect(randomIntSpy).toHaveBeenCalled();
      expect(mathRandomSpy).not.toHaveBeenCalled();
    } finally {
      randomIntSpy.mockRestore();
      mathRandomSpy.mockRestore();
    }
  });

  it('confirm с неверным кодом не активирует 2FA', () => {
    seedUser();
    setupTwoFactor('u1');
    expect(confirmTwoFactor('u1', '000000')).toEqual({ error: 'invalid-code' });
    expect((readJSON('users.json') as StoredUser[])[0].twoFactorEnabled).toBeFalsy();
  });

  it('confirm без предварительного setup — error no-pending', () => {
    seedUser();
    expect(confirmTwoFactor('u1', '123456')).toEqual({ error: 'no-pending' });
  });
});

describe('disableTwoFactor / adminDisableTwoFactor', () => {
  function enable2fa(): string {
    seedUser();
    setupTwoFactor('u1');
    const secret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    confirmTwoFactor('u1', generateTotp(secret));
    return secret;
  }

  it('disable с верным TOTP-кодом выключает 2FA и чистит секреты', () => {
    const secret = enable2fa();
    const result = disableTwoFactor('u1', generateTotp(secret));
    expect(result).toEqual({ ok: true });
    const stored = (readJSON('users.json') as StoredUser[])[0];
    expect(stored.twoFactorEnabled).toBe(false);
    expect(stored.twoFactorSecret).toBeUndefined();
    expect(stored.twoFactorBackupCodeHashes).toBeUndefined();
  });

  it('disable с backup-кодом расходует его и выключает 2FA', () => {
    seedUser();
    setupTwoFactor('u1');
    const secret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    const confirmResult = confirmTwoFactor('u1', generateTotp(secret));
    const backupCode = ('backupCodes' in confirmResult && confirmResult.backupCodes[0])!;
    expect(disableTwoFactor('u1', backupCode)).toEqual({ ok: true });
  });

  it('disable с неверным кодом — error invalid-code, 2FA остаётся включённой', () => {
    enable2fa();
    expect(disableTwoFactor('u1', '000000')).toEqual({ error: 'invalid-code' });
    expect((readJSON('users.json') as StoredUser[])[0].twoFactorEnabled).toBe(true);
  });

  it('disable когда 2FA не включена — error not-enabled', () => {
    seedUser();
    expect(disableTwoFactor('u1', '123456')).toEqual({ error: 'not-enabled' });
  });

  it('adminDisableTwoFactor выключает 2FA без кода', () => {
    enable2fa();
    expect(adminDisableTwoFactor('u1')).toEqual({ ok: true });
    expect((readJSON('users.json') as StoredUser[])[0].twoFactorEnabled).toBe(false);
  });

  it('adminDisableTwoFactor — error not-enabled, если 2FA не включена', () => {
    seedUser();
    expect(adminDisableTwoFactor('u1')).toEqual({ error: 'not-enabled' });
  });
});

describe('loginUser + completeTwoFactorLogin', () => {
  it('без 2FA логин выдаёт токен сразу', () => {
    seedUser();
    const result = loginUser('alice', 'secret123');
    expect('token' in result).toBe(true);
  });

  it('с включённой 2FA логин возвращает pendingToken, а не токен', () => {
    seedUser();
    setupTwoFactor('u1');
    const secret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    confirmTwoFactor('u1', generateTotp(secret));

    const result = loginUser('alice', 'secret123');
    expect('twoFactorRequired' in result).toBe(true);
    expect('token' in result).toBe(false);
  });

  it('completeTwoFactorLogin с верным кодом выдаёт полный токен', () => {
    seedUser();
    setupTwoFactor('u1');
    const secret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    confirmTwoFactor('u1', generateTotp(secret));

    const loginResult = loginUser('alice', 'secret123');
    const pendingToken = ('twoFactorRequired' in loginResult && loginResult.pendingToken)!;
    const finalResult = completeTwoFactorLogin(pendingToken, generateTotp(secret));
    expect('token' in finalResult).toBe(true);
  });

  it('completeTwoFactorLogin с неверным кодом — error invalid-code', () => {
    seedUser();
    setupTwoFactor('u1');
    const secret = (readJSON('users.json') as StoredUser[])[0].twoFactorPendingSecret!;
    confirmTwoFactor('u1', generateTotp(secret));

    const loginResult = loginUser('alice', 'secret123');
    const pendingToken = ('twoFactorRequired' in loginResult && loginResult.pendingToken)!;
    expect(completeTwoFactorLogin(pendingToken, '000000')).toEqual({ error: 'invalid-code' });
  });

  it('completeTwoFactorLogin с мусорным токеном — error invalid-token', () => {
    expect(completeTwoFactorLogin('garbage', '123456')).toEqual({ error: 'invalid-token' });
  });
});

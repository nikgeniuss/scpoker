import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage, getStorage } from './helpers/storage.js';
import {
  getOrCreateCode,
  getReferrerIdForCode,
  linkReferral,
  getUserReferralInfo,
  processMilestoneTick,
  getReferralConfig,
  updateReferralSettings,
} from '../referralService.js';
import { getBalance } from '../rewardsWalletService.js';
import { getNotifications } from '../inboxService.js';

function seedConfig(enabled: boolean, handsThreshold = 10, referrerReward = 100, refereeReward = 30): void {
  setStorage('referrals.json', {
    config: { enabled, handsThreshold, referrerReward, refereeReward },
    codes: {},
    codeOwners: {},
    links: {},
    networkClaims: [],
  });
}

// aggregateUserStats(userId, null, null) — lifetime-режим — читает handsLifetime.json напрямую
// (НЕ пересчитывает из hands.json), см. statsService.ts readLifetime().
function seedHandsLifetime(userId: string, hands: number): void {
  const raw = getStorage('handsLifetime.json') as Record<string, { hands: number; pnl: number; rake: number }> | undefined;
  const record = raw && typeof raw === 'object' ? { ...raw } : {};
  record[userId] = { hands, pnl: 0, rake: 0 };
  setStorage('handsLifetime.json', record);
}

const netA = { ip: '1.1.1.1', deviceId: 'dA' };
const netB = { ip: '2.2.2.2', deviceId: 'dB' };

describe('referralService — коды', () => {
  beforeEach(() => clearStorage());

  it('getOrCreateCode генерирует код один раз, дальше стабилен', () => {
    const c1 = getOrCreateCode('u1');
    const c2 = getOrCreateCode('u1');
    expect(c1).toBe(c2);
    expect(c1).toHaveLength(6);
  });

  it('getReferrerIdForCode резолвит код обратно в userId, регистр не важен', () => {
    const code = getOrCreateCode('u1');
    expect(getReferrerIdForCode(code)).toBe('u1');
    expect(getReferrerIdForCode(code.toLowerCase())).toBe('u1');
    expect(getReferrerIdForCode('GHOST1')).toBeNull();
  });

  it('разные юзеры получают разные коды', () => {
    const c1 = getOrCreateCode('u1');
    const c2 = getOrCreateCode('u2');
    expect(c1).not.toBe(c2);
  });
});

describe('referralService — linkReferral', () => {
  beforeEach(() => clearStorage());

  it('успешная привязка без коллизии сети — не заблокирована', () => {
    const r = linkReferral('newUser', 'referrer', netA, netB);
    expect(r).toEqual({ linked: true, blocked: false });
  });

  it('self-code — рефер не может привязать самого себя', () => {
    const r = linkReferral('u1', 'u1', netA, netA);
    expect(r).toEqual({ linked: false, reason: 'self-code' });
  });

  it('already-linked — повторная привязка того же newUserId отклоняется', () => {
    linkReferral('newUser', 'refA', netA, netB);
    const r = linkReferral('newUser', 'refC', netA, netB);
    expect(r).toEqual({ linked: false, reason: 'already-linked' });
  });

  it('анти-фарм: сеть совпадает с сетью РЕФЕРЕРА (self-referral через альт) — связь сохранена, blocked=true', () => {
    const r = linkReferral('altAccount', 'referrer', netA, netA); // та же сеть у нового аккаунта и у реферера
    expect(r).toEqual({ linked: true, blocked: true });
  });

  it('анти-фарм: сеть совпадает с уже привязанным ДРУГИМ new-аккаунтом — заблокирован', () => {
    linkReferral('firstReferred', 'refA', netA, netB);
    const r = linkReferral('secondReferred', 'refA', netA, netB); // та же сеть, что у firstReferred
    expect(r).toEqual({ linked: true, blocked: true });
  });

  it('разные сети — не блокируется', () => {
    linkReferral('firstReferred', 'refA', netA, netB);
    const r = linkReferral('secondReferred', 'refA', { ip: '9.9.9.9', deviceId: 'dX' }, netB);
    expect(r).toEqual({ linked: true, blocked: false });
  });
});

describe('referralService — processMilestoneTick', () => {
  beforeEach(() => clearStorage());

  it('фича выключена → пусто, ничего не начисляется', () => {
    seedConfig(false);
    linkReferral('newUser', 'referrer', netA, netB);
    seedHandsLifetime('newUser', 999);
    expect(processMilestoneTick()).toEqual([]);
    expect(getBalance('referrer')).toBe(0);
  });

  it('порог не достигнут → пусто', () => {
    seedConfig(true, 100);
    linkReferral('newUser', 'referrer', netA, netB);
    seedHandsLifetime('newUser', 50);
    expect(processMilestoneTick()).toEqual([]);
  });

  it('порог достигнут → оба получают HUB-коины, уведомления отправлены, rewarded=true', () => {
    seedConfig(true, 10, 100, 30);
    linkReferral('newUser', 'referrer', netA, netB);
    seedHandsLifetime('newUser', 10);

    const results = processMilestoneTick();
    expect(results).toEqual([{ newUserId: 'newUser', referrerId: 'referrer', referrerReward: 100, refereeReward: 30 }]);
    expect(getBalance('referrer')).toBe(100);
    expect(getBalance('newUser')).toBe(30);
    expect(getNotifications('referrer', 5)).toHaveLength(1);
    expect(getNotifications('newUser', 5)).toHaveLength(1);

    // повторный тик не начисляет снова
    seedHandsLifetime('newUser', 20); // ещё больше раздач
    expect(processMilestoneTick()).toEqual([]);
    expect(getBalance('referrer')).toBe(100);
  });

  it('заблокированная анти-фармом связь — не выплачивается даже при достигнутом пороге', () => {
    seedConfig(true, 10, 100, 30);
    linkReferral('altAccount', 'referrer', netA, netA); // blocked=true (self-referral)
    seedHandsLifetime('altAccount', 999);
    expect(processMilestoneTick()).toEqual([]);
    expect(getBalance('referrer')).toBe(0);
  });
});

describe('referralService — getUserReferralInfo и настройки', () => {
  beforeEach(() => clearStorage());

  it('getUserReferralInfo считает invited/rewarded/pending', () => {
    seedConfig(true, 10, 100, 30);
    linkReferral('u1', 'referrer', netA, netB);
    linkReferral('u2', 'referrer', { ip: '3.3.3.3', deviceId: 'd3' }, netB);
    seedHandsLifetime('u1', 10);
    processMilestoneTick(); // u1 rewarded, u2 pending

    const info = getUserReferralInfo('referrer');
    expect(info.invitedCount).toBe(2);
    expect(info.rewardedCount).toBe(1);
    expect(info.pendingCount).toBe(1);
  });

  it('updateReferralSettings патчит конфиг', () => {
    const updated = updateReferralSettings({ enabled: true, handsThreshold: 50 });
    expect(updated).toMatchObject({ enabled: true, handsThreshold: 50 });
    expect(getReferralConfig()).toEqual(updated);
  });

  it('санитизация — повреждённые codeOwners на диске не роняют чтение', () => {
    setStorage('referrals.json', { config: {}, codes: 'garbage', codeOwners: null, links: 'x', networkClaims: 'y' });
    expect(() => getReferralConfig()).not.toThrow();
    expect(getStorage('referrals.json')).toBeDefined();
  });
});

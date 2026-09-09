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
  accrueFromRake,
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

// §10.21.5 — доля пригласившего с рейка приглашённого. Копится с момента привязки, но
// выплачивается только после выполнения условия: первая выплата отдаёт всё накопленное,
// дальше процент капает сразу с каждой раздачи (решение пользователя 2026-09-07).
describe('referralService — процент с рейка приглашённого', () => {
  const netRef = { ip: '5.5.5.5', deviceId: 'dev-referrer' };
  const netNew = { ip: '6.6.6.6', deviceId: 'dev-new' };

  beforeEach(() => clearStorage());

  function seedWithPercent(percent: number, handsThreshold = 10): void {
    setStorage('referrals.json', {
      config: { enabled: true, handsThreshold, referrerReward: 100, refereeReward: 30, referrerRakePercent: percent },
      codes: {},
      codeOwners: {},
      links: {},
      networkClaims: [],
    });
  }

  it('до выполнения условия процент копится, а не выплачивается', () => {
    seedWithPercent(10);
    linkReferral('N', 'R', netNew, netRef);

    expect(accrueFromRake('N', 1000)).toBe(0); // 10% = 100, но условие ещё не выполнено
    expect(getBalance('R')).toBe(0);
    expect(getUserReferralInfo('R').pendingRake).toBe(100);
  });

  it('первая выплата отдаёт разовый бонус ПЛЮС всё накопленное за период', () => {
    seedWithPercent(10, 10);
    linkReferral('N', 'R', netNew, netRef);
    accrueFromRake('N', 1000); // +100 в накопление
    accrueFromRake('N', 500);  // +50
    seedHandsLifetime('N', 10); // условие выполнено

    expect(processMilestoneTick()).toHaveLength(1);
    expect(getBalance('R')).toBe(250); // 100 разовый + 150 накопленных
    expect(getBalance('N')).toBe(30);  // welcome-бонус приглашённому
    const info = getUserReferralInfo('R');
    expect(info.pendingRake).toBe(0);
    expect(info.totalRakeReward).toBe(150);
  });

  it('после первой выплаты процент начисляется сразу с каждой раздачи', () => {
    seedWithPercent(10, 10);
    linkReferral('N', 'R', netNew, netRef);
    seedHandsLifetime('N', 10);
    processMilestoneTick();
    const afterMilestone = getBalance('R');

    expect(accrueFromRake('N', 2000)).toBe(200); // начислено немедленно
    expect(getBalance('R')).toBe(afterMilestone + 200);
    expect(getUserReferralInfo('R').totalRakeReward).toBe(200);
  });

  it('процент 0 — механика выключена, ничего не копится', () => {
    seedWithPercent(0);
    linkReferral('N', 'R', netNew, netRef);
    expect(accrueFromRake('N', 5000)).toBe(0);
    expect(getUserReferralInfo('R').pendingRake).toBe(0);
  });

  it('заблокированная анти-фармом связь не копит и не платит', () => {
    seedWithPercent(10);
    linkReferral('N', 'R', netRef, netRef); // приглашённый с той же сети, что и реферер
    accrueFromRake('N', 1000);
    expect(getUserReferralInfo('R').pendingRake).toBe(0);
    expect(getBalance('R')).toBe(0);
  });

  it('игрок без пригласившего ничего не генерирует', () => {
    seedWithPercent(10);
    expect(accrueFromRake('nobody', 1000)).toBe(0);
  });

  it('выключенная рефералка не начисляет', () => {
    setStorage('referrals.json', {
      config: { enabled: false, handsThreshold: 10, referrerReward: 100, refereeReward: 30, referrerRakePercent: 10 },
      codes: {}, codeOwners: {}, links: {}, networkClaims: [],
    });
    linkReferral('N', 'R', netNew, netRef);
    expect(accrueFromRake('N', 1000)).toBe(0);
  });

  it('процент задаётся админом и зажимается сверху сотней', () => {
    seedWithPercent(10);
    expect(updateReferralSettings({ referrerRakePercent: 25 }).referrerRakePercent).toBe(25);
    expect(updateReferralSettings({ referrerRakePercent: 500 }).referrerRakePercent).toBe(100);
    // Отрицательное значение — невалидный ввод: санитайзер оставляет прежнее (как у остальных полей).
    expect(updateReferralSettings({ referrerRakePercent: -5 }).referrerRakePercent).toBe(100);
    expect(updateReferralSettings({ referrerRakePercent: 0 }).referrerRakePercent).toBe(0);
  });
});

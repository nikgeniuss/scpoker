import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage, getStorage } from './helpers/storage.js';
import {
  computeBonusAmount,
  applyRakeFifo,
  availableOf,
  releasedFor,
  isAccruing,
  isFinished,
  getConfig,
  updateSettings,
  grantForDeposit,
  accrueRake,
  accrueTournamentRake,
  getUserBonusState,
  claim,
  setChipsCreditor,
  type DepositBonus,
  type DepositBonusConfig,
} from '../depositBonusService.js';
import { getBalance } from '../rewardsWalletService.js';

const DAY_MS = 86_400_000;

function cfg(patch: Partial<DepositBonusConfig> = {}): DepositBonusConfig {
  return {
    enabled: true,
    currency: 'hub',
    firstPercent: 100,
    reloadPercent: 50,
    maxBonusAmount: 50_000,
    minDepositChips: 1_000,
    rakeMultiplier: 3,
    lifetimeDays: 30,
    countTournamentRake: true,
    ...patch,
  };
}

function seedConfig(patch: Partial<DepositBonusConfig> = {}): void {
  setStorage('deposit-bonus.json', { config: cfg(patch), bonuses: [] });
}

function bonus(patch: Partial<DepositBonus> = {}): DepositBonus {
  const grantedAt = patch.grantedAt ?? 1_000;
  return {
    id: 'b1',
    userId: 'u1',
    currency: 'hub',
    amount: 300,
    rakeRequired: 900,
    rakeAccrued: 0,
    released: 0,
    claimed: 0,
    grantedAt,
    expiresAt: grantedAt + 30 * DAY_MS,
    source: 'first',
    ...patch,
  };
}

describe('depositBonusService — расчёт суммы бонуса', () => {
  it('первый депозит считается по firstPercent, повторный — по reloadPercent', () => {
    expect(computeBonusAmount(10_000, true, cfg())).toBe(10_000);
    expect(computeBonusAmount(10_000, false, cfg())).toBe(5_000);
  });

  it('депозит меньше минимального бонуса не даёт', () => {
    expect(computeBonusAmount(999, true, cfg({ minDepositChips: 1_000 }))).toBe(0);
  });

  it('сумма режется потолком maxBonusAmount', () => {
    expect(computeBonusAmount(1_000_000, true, cfg({ maxBonusAmount: 50_000 }))).toBe(50_000);
  });

  it('выключенная фича не даёт бонуса даже на большой депозит', () => {
    expect(computeBonusAmount(1_000_000, true, cfg({ enabled: false }))).toBe(0);
  });

  it('нулевой процент для этого типа депозита не даёт бонуса', () => {
    expect(computeBonusAmount(10_000, false, cfg({ reloadPercent: 0 }))).toBe(0);
  });
});

describe('depositBonusService — открытие рейком', () => {
  it('открытая часть пропорциональна зачтённому рейку', () => {
    const b = bonus({ amount: 300, rakeRequired: 900, rakeAccrued: 300 });
    expect(releasedFor(b)).toBe(100);
  });

  it('рейк сверх требуемого не открывает больше суммы бонуса', () => {
    const b = bonus({ amount: 300, rakeRequired: 900, rakeAccrued: 5_000 });
    expect(releasedFor(b)).toBe(300);
  });

  it('FIFO: рейк открывает сначала старший бонус, остаток переходит следующему', () => {
    const older = bonus({ id: 'old', amount: 100, rakeRequired: 300, grantedAt: 1_000 });
    const newer = bonus({ id: 'new', amount: 100, rakeRequired: 300, grantedAt: 2_000 });
    const released = applyRakeFifo([older, newer], 450, 5_000);

    expect(older.rakeAccrued).toBe(300);
    expect(older.released).toBe(100);
    expect(newer.rakeAccrued).toBe(150);
    expect(newer.released).toBe(50);
    expect(released).toBe(150);
  });

  it('истёкший бонус рейк не принимает — неоткрытый остаток сгорает', () => {
    const expired = bonus({ grantedAt: 0, expiresAt: 1_000, amount: 300, rakeRequired: 900 });
    const released = applyRakeFifo([expired], 900, 2_000);

    expect(released).toBe(0);
    expect(expired.rakeAccrued).toBe(0);
    expect(isAccruing(expired, 2_000)).toBe(false);
  });

  it('уже открытая часть истёкшего бонуса остаётся доступной к получению', () => {
    const expired = bonus({ expiresAt: 1_000, amount: 300, released: 120, claimed: 0 });
    expect(availableOf(expired)).toBe(120);
    expect(isFinished(expired, 2_000)).toBe(false);
  });

  it('полностью забранный бонус считается завершённым', () => {
    expect(isFinished(bonus({ amount: 300, released: 300, claimed: 300 }), 5_000)).toBe(true);
  });
});

describe('depositBonusService — выдача на депозит', () => {
  beforeEach(() => clearStorage());

  it('выдаёт бонус с зафиксированным требованием по рейку', () => {
    seedConfig({ rakeMultiplier: 3 });
    const b = grantForDeposit('u1', 10_000, true, 'tx1', 1_000);

    expect(b).not.toBeNull();
    expect(b?.amount).toBe(10_000);
    expect(b?.rakeRequired).toBe(30_000);
    expect(b?.source).toBe('first');
    expect(b?.depositTxid).toBe('tx1');
  });

  it('валюта фиксируется на момент выдачи и не меняется при переключении настройки', () => {
    seedConfig({ currency: 'chips' });
    const b = grantForDeposit('u1', 10_000, true, 'tx1', 1_000);
    expect(b?.currency).toBe('chips');

    updateSettings({ currency: 'hub' });
    expect(getUserBonusState('u1').bonuses[0].currency).toBe('chips');
  });

  it('выключенная фича не выдаёт бонус на депозит', () => {
    seedConfig({ enabled: false });
    expect(grantForDeposit('u1', 100_000, true, 'tx1', 1_000)).toBeNull();
  });

  it('срок жизни считается от момента выдачи', () => {
    seedConfig({ lifetimeDays: 7 });
    const b = grantForDeposit('u1', 10_000, true, undefined, 1_000);
    expect(b?.expiresAt).toBe(1_000 + 7 * DAY_MS);
  });
});

describe('depositBonusService — зачёт рейка', () => {
  beforeEach(() => clearStorage());

  it('рейк открывает часть бонуса и виден в личном кабинете', () => {
    seedConfig({ rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);

    const released = accrueRake('u1', 9_000, 2_000);

    expect(released).toBe(3_000);
    const state = getUserBonusState('u1', 2_000);
    expect(state.available).toBe(3_000);
    expect(state.locked).toBe(7_000);
  });

  it('рейк чужого игрока не открывает бонус', () => {
    seedConfig();
    grantForDeposit('u1', 10_000, true, undefined, 1_000);

    expect(accrueRake('u2', 9_000, 2_000)).toBe(0);
    expect(getUserBonusState('u1', 2_000).available).toBe(0);
  });

  it('при выключенной фиче рейк не засчитывается уже выданным бонусам', () => {
    seedConfig();
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    updateSettings({ enabled: false });

    expect(accrueRake('u1', 9_000, 2_000)).toBe(0);
  });

  it('турнирная комиссия не засчитывается при выключенном countTournamentRake', () => {
    seedConfig({ countTournamentRake: false });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);

    expect(accrueTournamentRake('u1', 9_000, 2_000)).toBe(0);
    expect(accrueRake('u1', 9_000, 2_000)).toBe(3_000); // кэш-рейк засчитывается всегда
  });
});

describe('depositBonusService — получение бонуса', () => {
  beforeEach(() => {
    clearStorage();
    setChipsCreditor(() => false);
  });

  it('HUB-бонус начисляется в кошелёк наград', () => {
    seedConfig({ currency: 'hub', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 9_000, 2_000);

    const result = claim('u1', 2_000);

    expect(result).toEqual({ ok: true, chips: 0, hub: 3_000 });
    expect(getBalance('u1')).toBe(3_000);
  });

  it('бонус в фишках уходит через creditor в банкролл', () => {
    const credited: { userId: string; amount: number }[] = [];
    setChipsCreditor((userId, amount) => {
      credited.push({ userId, amount });
      return true;
    });
    seedConfig({ currency: 'chips', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 9_000, 2_000);

    const result = claim('u1', 2_000);

    expect(result).toEqual({ ok: true, chips: 3_000, hub: 0 });
    expect(credited).toEqual([{ userId: 'u1', amount: 3_000 }]);
    expect(getBalance('u1')).toBe(0); // кошелёк наград не трогается
  });

  it('повторный claim не выплачивает то же самое второй раз', () => {
    seedConfig({ currency: 'hub', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 9_000, 2_000);

    claim('u1', 2_000);
    const second = claim('u1', 2_000);

    expect(second).toEqual({ error: 'nothing-to-claim' });
    expect(getBalance('u1')).toBe(3_000);
  });

  it('после получения открывается и забирается только новая часть', () => {
    seedConfig({ currency: 'hub', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 9_000, 2_000);
    claim('u1', 2_000);

    accrueRake('u1', 9_000, 3_000);
    const second = claim('u1', 3_000);

    expect(second).toEqual({ ok: true, chips: 0, hub: 3_000 });
    expect(getBalance('u1')).toBe(6_000);
  });

  it('сбой начисления фишек не съедает открытую часть — её можно забрать позже', () => {
    setChipsCreditor(() => false); // юзера нет/банкролл недоступен
    seedConfig({ currency: 'chips', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 9_000, 2_000);

    expect(claim('u1', 2_000)).toEqual({ error: 'claim-failed' });
    expect(getUserBonusState('u1', 2_000).available).toBe(3_000);

    setChipsCreditor(() => true);
    expect(claim('u1', 2_000)).toEqual({ ok: true, chips: 3_000, hub: 0 });
  });

  it('забирать нечего, пока рейк не отыгран', () => {
    seedConfig();
    grantForDeposit('u1', 10_000, true, undefined, 1_000);

    expect(claim('u1', 2_000)).toEqual({ error: 'nothing-to-claim' });
  });

  it('полностью закрытый бонус убирается из файла', () => {
    seedConfig({ currency: 'hub', rakeMultiplier: 3 });
    grantForDeposit('u1', 10_000, true, undefined, 1_000);
    accrueRake('u1', 30_000, 2_000);
    claim('u1', 2_000);

    const stored = getStorage('deposit-bonus.json') as { bonuses: DepositBonus[] };
    expect(stored.bonuses).toHaveLength(0);
  });
});

describe('depositBonusService — конфиг', () => {
  beforeEach(() => clearStorage());

  it('по умолчанию фича выключена', () => {
    expect(getConfig().enabled).toBe(false);
  });

  it('нулевой множитель нормализуется — бонус не может открыться без рейка', () => {
    expect(updateSettings({ rakeMultiplier: 0 }).rakeMultiplier).toBe(0.1);
  });

  it('мусор в настройках не ломает конфиг', () => {
    setStorage('deposit-bonus.json', { config: { enabled: 'да', rakeMultiplier: 'много' }, bonuses: 'нет' });
    const c = getConfig();

    expect(c.enabled).toBe(false);
    expect(c.rakeMultiplier).toBe(3);
    expect(getUserBonusState('u1').bonuses).toEqual([]);
  });
});

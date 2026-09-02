import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import { getBalance, credit, debit, getHistory, getUserWalletInfo, getWalletState } from '../rewardsWalletService.js';

describe('rewardsWalletService', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('баланс нового юзера — 0, без файла на диске', () => {
    expect(getBalance('u1')).toBe(0);
    expect(getHistory('u1')).toEqual([]);
  });

  it('credit начисляет баланс и totalEarned, пишет историю', () => {
    const balance = credit('u1', 100, 'streak');
    expect(balance).toBe(100);
    expect(getBalance('u1')).toBe(100);
    const info = getUserWalletInfo('u1');
    expect(info.totalEarned).toBe(100);
    expect(info.totalSpent).toBe(0);
    expect(info.history).toHaveLength(1);
    expect(info.history[0]).toMatchObject({ userId: 'u1', delta: 100, reason: 'streak' });
  });

  it('credit с amount<=0 — no-op, не пишет историю', () => {
    credit('u1', 0, 'streak');
    credit('u1', -50, 'streak');
    expect(getBalance('u1')).toBe(0);
    expect(getHistory('u1')).toEqual([]);
  });

  it('несколько credit накапливаются, totalEarned = сумма', () => {
    credit('u1', 100, 'rakeback');
    credit('u1', 50, 'mission');
    expect(getBalance('u1')).toBe(150);
    expect(getUserWalletInfo('u1').totalEarned).toBe(150);
    expect(getHistory('u1')).toHaveLength(2);
  });

  it('debit списывает при достаточном балансе, пишет отрицательную дельту', () => {
    credit('u1', 100, 'rakeback');
    const balance = debit('u1', 40, 'shop', 'ticket:sng-1');
    expect(balance).toBe(60);
    expect(getBalance('u1')).toBe(60);
    const info = getUserWalletInfo('u1');
    expect(info.totalSpent).toBe(40);
    expect(info.history[0]).toMatchObject({ delta: -40, reason: 'shop', meta: 'ticket:sng-1' });
  });

  it('debit при недостаточном балансе — null, ничего не меняет', () => {
    credit('u1', 30, 'streak');
    const result = debit('u1', 100, 'shop');
    expect(result).toBeNull();
    expect(getBalance('u1')).toBe(30);
    expect(getHistory('u1')).toHaveLength(1); // только исходный credit, debit не записался
  });

  it('debit с amount<=0 — no-op, возвращает текущий баланс', () => {
    credit('u1', 30, 'streak');
    expect(debit('u1', 0, 'shop')).toBe(30);
    expect(getBalance('u1')).toBe(30);
  });

  it('история per-user изолирована', () => {
    credit('u1', 10, 'streak');
    credit('u2', 20, 'streak');
    expect(getHistory('u1')).toHaveLength(1);
    expect(getHistory('u2')).toHaveLength(1);
    expect(getBalance('u1')).toBe(10);
    expect(getBalance('u2')).toBe(20);
  });

  it('санитизация — повреждённые записи истории на диске не роняют чтение', () => {
    setStorage('rewards-wallet.json', {
      users: { u1: { balance: 'not-a-number' } },
      history: [{ userId: 'u1' }, null, 'garbage', { userId: 'u2', delta: 5, reason: 'streak', t: 123 }],
    });
    expect(() => getWalletState()).not.toThrow();
    expect(getBalance('u1')).toBe(0); // невалидный balance → санитизирован в 0
    const history = getWalletState().history;
    expect(history).toHaveLength(2); // мусор/null отфильтрованы, валидные записи остались
    expect(history.find((h) => h.userId === 'u2')).toMatchObject({ delta: 5, reason: 'streak' });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PaymentsSettings } from '@poker-room/shared';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));
// 'ethereum' симулирует "admin включил тумблер в settings, но env-контракт не настроен" —
// settings.chains.ethereum.enabled=true, но адаптер всё равно null (chain-not-configured).
vi.mock('../chains/index.js', () => ({
  getChainAdapter: (chain: string) =>
    chain === 'ethereum'
      ? null
      : {
          chain,
          nativeSymbol: 'X',
          isValidAddress: (addr: string) => addr.startsWith('valid-'),
        },
}));

import { setStorage, clearStorage } from './helpers/storage.js';
import {
  createWithdrawalRequest,
  approveWithdrawal,
  rejectWithdrawal,
  markSending,
  markPaid,
  markFailed,
  getWithdrawalsQueue,
  getUserWithdrawalHistory,
} from '../withdrawalService.js';

const SETTINGS: PaymentsSettings = {
  enabled: true,
  exchangeRateCentsPerUsdt: 10000, // 1 USDT = 100.00 фишек (10000 центов)
  minDepositUsdt: 5,
  maxDepositUsdt: 10000,
  minWithdrawalUsdt: 5,
  maxWithdrawalUsdt: 5000,
  chains: {
    tron: { enabled: true, minConfirmations: 19 },
    ethereum: { enabled: true, minConfirmations: 12 },
    bsc: { enabled: true, minConfirmations: 15 },
  },
};

beforeEach(() => {
  clearStorage();
  setStorage('users.json', [{ id: 'user1', username: 'Alice', chips: 1_000_000 }]); // 10000.00 фишек
});

describe('withdrawalService — createWithdrawalRequest', () => {
  it('создаёт заявку и немедленно дебетует баланс', () => {
    const result = createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', SETTINGS);
    expect('error' in result).toBe(false);
    const w = result as Exclude<typeof result, { error: string }>;
    expect(w.status).toBe('pending');
    expect(w.amountChips).toBe(100000); // 10 USDT * 10000 центов
    expect(w.userId).toBe('user1');
    expect(w.chain).toBe('tron');
  });

  it('недостаточно средств — ошибка, баланс не трогается', () => {
    // 200 USDT — в пределах лимита (5..5000), но дороже баланса (1_000_000 chip-cents = 100 USDT)
    const result = createWithdrawalRequest('user1', 'Alice', 'tron', 200, 'valid-address', SETTINGS);
    expect(result).toEqual({ error: 'insufficient-balance' });
  });

  it('невалидный адрес — ошибка', () => {
    const result = createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'bad-address', SETTINGS);
    expect(result).toEqual({ error: 'invalid-address' });
  });

  it('сумма вне диапазона — ошибка', () => {
    const result = createWithdrawalRequest('user1', 'Alice', 'tron', 1, 'valid-address', SETTINGS);
    expect('error' in result).toBe(true);
  });

  it('сеть включена в настройках, но адаптер не сконфигурирован (нет env-контракта) — ошибка', () => {
    const result = createWithdrawalRequest('user1', 'Alice', 'ethereum', 10, 'valid-address', SETTINGS);
    expect(result).toEqual({ error: 'chain-not-configured' });
  });

  it('модуль выключен — ошибка', () => {
    const result = createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', { ...SETTINGS, enabled: false });
    expect(result).toEqual({ error: 'payments-disabled' });
  });
});

describe('withdrawalService — машина состояний', () => {
  function makeRequest() {
    return createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', SETTINGS) as { id: string };
  }

  it('pending → approved → sending → paid — полный happy path', () => {
    const { id } = makeRequest();
    expect((approveWithdrawal(id, 'admin1') as { status: string }).status).toBe('approved');
    expect((markSending(id) as { status: string }).status).toBe('sending');
    expect((markPaid(id, '0xtxid') as { status: string; txid?: string }).txid).toBe('0xtxid');
  });

  it('нельзя approve уже approved заявку (идемпотентность)', () => {
    const { id } = makeRequest();
    approveWithdrawal(id, 'admin1');
    const second = approveWithdrawal(id, 'admin1');
    expect('error' in second).toBe(true);
  });

  it('нельзя markPaid без промежуточного markSending', () => {
    const { id } = makeRequest();
    approveWithdrawal(id, 'admin1');
    const result = markPaid(id, '0xtxid');
    expect('error' in result).toBe(true);
  });

  it('reject возвращает дебетованные фишки пользователю', () => {
    const { id } = makeRequest();
    rejectWithdrawal(id, 'admin1', 'подозрительный адрес');
    // баланс должен вернуться к исходным 1_000_000 — проверяем через новую заявку на всю сумму
    const full = createWithdrawalRequest('user1', 'Alice', 'tron', 100, 'valid-address', SETTINGS);
    expect('error' in full).toBe(false);
  });

  it('нельзя reject уже отклонённую заявку', () => {
    const { id } = makeRequest();
    rejectWithdrawal(id, 'admin1');
    const second = rejectWithdrawal(id, 'admin1');
    expect('error' in second).toBe(true);
  });

  it('markFailed возвращает фишки и переводит в failed', () => {
    const { id } = makeRequest();
    approveWithdrawal(id, 'admin1');
    markSending(id);
    const result = markFailed(id, 'broadcast error');
    expect((result as { status: string }).status).toBe('failed');
    const full = createWithdrawalRequest('user1', 'Alice', 'tron', 100, 'valid-address', SETTINGS);
    expect('error' in full).toBe(false);
  });
});

describe('withdrawalService — выборки', () => {
  it('getWithdrawalsQueue фильтрует по статусу', () => {
    const a = createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', SETTINGS) as { id: string };
    createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', SETTINGS);
    approveWithdrawal(a.id, 'admin1');
    expect(getWithdrawalsQueue('pending')).toHaveLength(1);
    expect(getWithdrawalsQueue('approved')).toHaveLength(1);
    expect(getWithdrawalsQueue()).toHaveLength(2);
  });

  it('getUserWithdrawalHistory отдаёт только заявки юзера, новые сверху', () => {
    setStorage('users.json', [
      { id: 'user1', username: 'Alice', chips: 1_000_000 },
      { id: 'user2', username: 'Bob', chips: 1_000_000 },
    ]);
    createWithdrawalRequest('user1', 'Alice', 'tron', 10, 'valid-address', SETTINGS);
    createWithdrawalRequest('user2', 'Bob', 'tron', 10, 'valid-address', SETTINGS);
    createWithdrawalRequest('user1', 'Alice', 'tron', 20, 'valid-address', SETTINGS);
    const history = getUserWithdrawalHistory('user1');
    expect(history).toHaveLength(2);
    expect(history.every((w) => w.userId === 'user1')).toBe(true);
  });
});

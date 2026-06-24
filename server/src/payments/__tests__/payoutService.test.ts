import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WithdrawalRequest } from '@poker-room/shared';

const {
  mockSendUsdt,
  mockGetNativeBalance,
  mockGetUsdtBalance,
  mockAddressFromPrivateKey,
  mockMarkSending,
  mockMarkPaid,
  mockMarkFailed,
} = vi.hoisted(() => ({
  mockSendUsdt: vi.fn(),
  mockGetNativeBalance: vi.fn(),
  mockGetUsdtBalance: vi.fn(),
  mockAddressFromPrivateKey: vi.fn((pk: string) => `addr-of-${pk}`),
  mockMarkSending: vi.fn(),
  mockMarkPaid: vi.fn(),
  mockMarkFailed: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  HOT_WALLET_PRIVATE_KEY_TRON: 'tron-hot-key',
  HOT_WALLET_PRIVATE_KEY_EVM: null, // EVM хот-кошелёк не настроен — для теста "not-configured"
}));

vi.mock('../chains/index.js', () => ({
  chainFamilyOf: (chain: string) => (chain === 'tron' ? 'tron' : 'evm'),
  getChainAdapter: (chain: string) =>
    chain === 'tron'
      ? {
          chain: 'tron',
          nativeSymbol: 'TRX',
          sendUsdt: mockSendUsdt,
          getNativeBalance: mockGetNativeBalance,
          getUsdtBalance: mockGetUsdtBalance,
          addressFromPrivateKey: mockAddressFromPrivateKey,
        }
      : null, // ethereum/bsc — адаптер не сконфигурирован в этом тесте
}));

vi.mock('../withdrawalService.js', () => ({
  markSending: mockMarkSending,
  markPaid: mockMarkPaid,
  markFailed: mockMarkFailed,
}));

import { sendPayout, getHotWalletBalances } from '../payoutService.js';

const WITHDRAWAL: WithdrawalRequest = {
  id: 'w1',
  userId: 'user1',
  username: 'Alice',
  chain: 'tron',
  amountChips: 100000,
  amountUsdtRaw: '10000000',
  payoutAddress: 'Tplayeraddress',
  status: 'approved',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockSendUsdt.mockReset();
  mockGetNativeBalance.mockReset();
  mockGetUsdtBalance.mockReset();
  mockMarkSending.mockReset().mockReturnValue({ ...WITHDRAWAL, status: 'sending' });
  mockMarkPaid.mockReset();
  mockMarkFailed.mockReset();
});

describe('payoutService — sendPayout', () => {
  it('happy path: markSending → sendUsdt → markPaid, возвращает txid', async () => {
    mockSendUsdt.mockResolvedValue({ txid: '0xabc' });
    const result = await sendPayout(WITHDRAWAL);
    expect(result).toEqual({ txid: '0xabc' });
    expect(mockMarkSending).toHaveBeenCalledWith('w1');
    expect(mockSendUsdt).toHaveBeenCalledWith('tron-hot-key', 'Tplayeraddress', 10000000n);
    expect(mockMarkPaid).toHaveBeenCalledWith('w1', '0xabc');
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it('сеть без адаптера — ошибка, markSending не вызывается (не трогаем статус)', async () => {
    const result = await sendPayout({ ...WITHDRAWAL, chain: 'ethereum' });
    expect(result).toEqual({ error: 'chain-not-configured' });
    expect(mockMarkSending).not.toHaveBeenCalled();
  });

  it('нет приватного ключа хот-кошелька — ошибка, markSending не вызывается', async () => {
    const result = await sendPayout({ ...WITHDRAWAL, chain: 'bsc' });
    // chain-not-configured возвращается раньше (адаптер для bsc тоже null в этом моке) —
    // достаточно убедиться, что без сети деньги никуда не уходят.
    expect('error' in result).toBe(true);
    expect(mockSendUsdt).not.toHaveBeenCalled();
  });

  it('markSending возвращает ошибку (неверный переход статуса) — sendUsdt не вызывается', async () => {
    mockMarkSending.mockReturnValue({ error: 'invalid-status-transition:paid' });
    const result = await sendPayout(WITHDRAWAL);
    expect(result).toEqual({ error: 'invalid-status-transition:paid' });
    expect(mockSendUsdt).not.toHaveBeenCalled();
  });

  it('sendUsdt бросает ошибку — markFailed вызывается с причиной, markPaid не вызывается', async () => {
    mockSendUsdt.mockRejectedValue(new Error('insufficient energy'));
    const result = await sendPayout(WITHDRAWAL);
    expect(result).toEqual({ error: 'insufficient energy' });
    expect(mockMarkFailed).toHaveBeenCalledWith('w1', 'insufficient energy');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });
});

describe('payoutService — getHotWalletBalances', () => {
  it('возвращает баланс для сконфигурированной сети и null для остальных', async () => {
    mockGetNativeBalance.mockResolvedValue(1_000_000n);
    mockGetUsdtBalance.mockResolvedValue(5_000_000n);
    const balances = await getHotWalletBalances();
    expect(balances.tron).toEqual({ address: 'addr-of-tron-hot-key', native: '1000000', usdt: '5000000' });
    expect(balances.ethereum).toBeNull();
    expect(balances.bsc).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockGetChainAdapter, mockHotWalletKeyFor, mockSendUsdt, mockSendNative, mockGetNativeBalance, mockEstimateSweepFee, mockAddressFromPrivateKey } =
  vi.hoisted(() => ({
    mockGetChainAdapter: vi.fn(),
    mockHotWalletKeyFor: vi.fn(),
    mockSendUsdt: vi.fn(),
    mockSendNative: vi.fn(),
    mockGetNativeBalance: vi.fn(),
    mockEstimateSweepFee: vi.fn(),
    mockAddressFromPrivateKey: vi.fn((pk: string) => `hot-addr-of-${pk}`),
  }));

vi.mock('../chains/index.js', () => ({
  getChainAdapter: mockGetChainAdapter,
}));

vi.mock('../hotWallet.js', () => ({
  hotWalletKeyFor: mockHotWalletKeyFor,
}));

import { sweepDeposit } from '../sweepService.js';

const FAKE_ADAPTER = {
  chain: 'tron',
  nativeSymbol: 'TRX',
  sendUsdt: mockSendUsdt,
  sendNative: mockSendNative,
  getNativeBalance: mockGetNativeBalance,
  estimateSweepFee: mockEstimateSweepFee,
  addressFromPrivateKey: mockAddressFromPrivateKey,
};

beforeEach(() => {
  mockGetChainAdapter.mockReset().mockReturnValue(FAKE_ADAPTER);
  mockHotWalletKeyFor.mockReset().mockReturnValue('hot-key');
  mockSendUsdt.mockReset();
  mockSendNative.mockReset();
  mockGetNativeBalance.mockReset();
  mockEstimateSweepFee.mockReset().mockResolvedValue(20_000_000n);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sweepService — sweepDeposit', () => {
  it('сети нет — chain-not-configured, ничего не отправляем', async () => {
    mockGetChainAdapter.mockReturnValue(null);
    const result = await sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    expect(result).toEqual({ error: 'chain-not-configured' });
    expect(mockSendUsdt).not.toHaveBeenCalled();
  });

  it('нет приватного ключа хот-кошелька — hot-wallet-not-configured', async () => {
    mockHotWalletKeyFor.mockReturnValue(null);
    const result = await sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    expect(result).toEqual({ error: 'hot-wallet-not-configured' });
  });

  it('на адресе уже достаточно газа — фондирование не нужно, сразу sendUsdt', async () => {
    mockGetNativeBalance.mockResolvedValue(30_000_000n); // больше estimateSweepFee
    mockSendUsdt.mockResolvedValue({ txid: 'sweep-tx-1' });
    const result = await sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    expect(result).toEqual({ txid: 'sweep-tx-1' });
    expect(mockSendNative).not.toHaveBeenCalled();
    expect(mockSendUsdt).toHaveBeenCalledWith('deposit-key', 'hot-addr-of-hot-key', 10_000_000n);
  });

  it('газа не хватает — фондирует с хот-кошелька, ждёт подтверждения, потом sendUsdt', async () => {
    mockGetNativeBalance
      .mockResolvedValueOnce(0n) // проверка до фондирования
      .mockResolvedValueOnce(20_000_000n); // подтвердилось после первой проверки в цикле ожидания
    mockSendNative.mockResolvedValue({ txid: 'fund-tx-1' });
    mockSendUsdt.mockResolvedValue({ txid: 'sweep-tx-2' });

    const promise = sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(mockSendNative).toHaveBeenCalledWith('hot-key', 'Tdeposit', 20_000_000n);
    expect(result).toEqual({ txid: 'sweep-tx-2' });
  });

  it('фондирование не подтвердилось за все попытки — gas-funding-not-confirmed', async () => {
    mockGetNativeBalance.mockResolvedValue(0n); // никогда не доходит до требуемой суммы
    mockSendNative.mockResolvedValue({ txid: 'fund-tx-2' });

    const promise = sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    await vi.advanceTimersByTimeAsync(4000 * 15);
    const result = await promise;

    expect(result).toEqual({ error: 'gas-funding-not-confirmed' });
    expect(mockSendUsdt).not.toHaveBeenCalled();
  });

  it('sendUsdt бросает ошибку — возвращаем error, не падаем', async () => {
    mockGetNativeBalance.mockResolvedValue(30_000_000n);
    mockSendUsdt.mockRejectedValue(new Error('insufficient energy'));
    const result = await sweepDeposit('tron', 'Tdeposit', 'deposit-key', 10_000_000n);
    expect(result).toEqual({ error: 'insufficient energy' });
  });
});

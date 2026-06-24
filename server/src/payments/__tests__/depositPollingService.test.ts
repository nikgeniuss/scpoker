import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PaymentsSettings } from '@poker-room/shared';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

const mockGetIncoming = vi.fn();
const mockWallets: Record<string, Array<{ userId: string; chainFamily: string; address: string; derivationIndex: number; createdAt: string }>> = {
  tron: [{ userId: 'user1', chainFamily: 'tron', address: 'Tfake1', derivationIndex: 0, createdAt: '2026-01-01' }],
  evm: [],
};

vi.mock('../chains/index.js', () => ({
  getAllChainAdapters: () => [
    { chain: 'tron', adapter: { chain: 'tron', nativeSymbol: 'TRX', getIncomingUsdtTransfers: mockGetIncoming } },
  ],
  chainFamilyOf: (chain: string) => (chain === 'tron' ? 'tron' : 'evm'),
  // sweepService.sweepDeposit реальный (не мокается) — getChainAdapter возвращает null,
  // чтобы свип в этих тестах детектора депозитов завершался "chain-not-configured", а не падал.
  getChainAdapter: () => null,
}));

const mockGetDepositPrivateKey = vi.fn(() => 'fake-private-key');
vi.mock('../walletService.js', () => ({
  getAllDepositAddresses: (family: string) => mockWallets[family] ?? [],
  getDepositPrivateKey: (...args: unknown[]) => mockGetDepositPrivateKey(...args),
}));

const mockSweepDeposit = vi.fn();
vi.mock('../sweepService.js', () => ({
  sweepDeposit: (...args: unknown[]) => mockSweepDeposit(...args),
}));

import { setStorage, getStorage, clearStorage } from './helpers/storage.js';
import { pollOnce } from '../depositPollingService.js';

const SETTINGS: PaymentsSettings = {
  enabled: true,
  exchangeRateCentsPerUsdt: 10000,
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
  setStorage('users.json', [{ id: 'user1', username: 'Alice', chips: 0 }]);
  mockGetIncoming.mockReset();
  mockGetDepositPrivateKey.mockReset().mockReturnValue('fake-private-key');
  mockSweepDeposit.mockReset().mockResolvedValue({ error: 'chain-not-configured' });
});

describe('depositPollingService — pollOnce', () => {
  it('кредитует новый подтверждённый депозит и пишет запись в deposits.json', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx1', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000); // 5 USDT * 10000 центов

    const deposits = getStorage('deposits.json') as Array<{ txid: string }>;
    expect(deposits).toHaveLength(1);
    expect(deposits[0].txid).toBe('tx1');
  });

  it('идемпотентность: повторный pollOnce с тем же txid не кредитует второй раз', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx1', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    await pollOnce(() => SETTINGS);
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000);
    const deposits = getStorage('deposits.json') as Array<{ txid: string }>;
    expect(deposits).toHaveLength(1);
  });

  it('неподтверждённый перевод (confirmed=false) не кредитуется', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx2', amountRaw: 5_000_000n, blockNumber: 100, confirmed: false }]);
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(0);
    expect(getStorage('deposits.json')).toBeUndefined();
  });

  it('ошибка на одном адресе не прерывает опрос остальных', async () => {
    mockWallets.tron = [
      { userId: 'user1', chainFamily: 'tron', address: 'Tfake1', derivationIndex: 0, createdAt: '2026-01-01' },
      { userId: 'user2', chainFamily: 'tron', address: 'Tfake2', derivationIndex: 1, createdAt: '2026-01-01' },
    ];
    setStorage('users.json', [
      { id: 'user1', username: 'Alice', chips: 0 },
      { id: 'user2', username: 'Bob', chips: 0 },
    ]);
    mockGetIncoming.mockImplementation(async (address: string) => {
      if (address === 'Tfake1') throw new Error('RPC недоступен');
      return [{ txid: 'tx3', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }];
    });

    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user2')?.chips).toBe(50000);
    mockWallets.tron = [{ userId: 'user1', chainFamily: 'tron', address: 'Tfake1', derivationIndex: 0, createdAt: '2026-01-01' }];
  });

  it('выключенный payments.enabled — опрос не идёт вообще', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx4', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    await pollOnce(() => ({ ...SETTINGS, enabled: false }));
    expect(mockGetIncoming).not.toHaveBeenCalled();
  });

  it('выключенная конкретная сеть — её адаптер не опрашивается', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx5', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    await pollOnce(() => ({ ...SETTINGS, chains: { ...SETTINGS.chains, tron: { ...SETTINGS.chains.tron, enabled: false } } }));
    expect(mockGetIncoming).not.toHaveBeenCalled();
  });

  it('успешный свип сразу при кредите — deposits.json получает swept:true и sweepTxid', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx6', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    mockSweepDeposit.mockResolvedValue({ txid: 'sweep-tx-1' });

    await pollOnce(() => SETTINGS);

    const deposits = getStorage('deposits.json') as Array<{ txid: string; swept: boolean; sweepTxid?: string }>;
    expect(deposits).toHaveLength(1);
    expect(deposits[0].swept).toBe(true);
    expect(deposits[0].sweepTxid).toBe('sweep-tx-1');
    expect(mockSweepDeposit).toHaveBeenCalledWith('tron', 'Tfake1', 'fake-private-key', 5_000_000n);
  });

  it('неудачный свип — кредит чипов сохраняется, запись остаётся swept:false', async () => {
    mockGetIncoming.mockResolvedValue([{ txid: 'tx7', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    mockSweepDeposit.mockResolvedValue({ error: 'gas-funding-not-confirmed' });

    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000);
    const deposits = getStorage('deposits.json') as Array<{ txid: string; swept: boolean }>;
    expect(deposits[0].swept).toBe(false);
  });

  it('ретрай свипа на следующем тике подхватывает ранее неудачную запись', async () => {
    mockGetIncoming.mockResolvedValue([]);
    setStorage('deposits.json', [
      {
        txid: 'tx8',
        chain: 'tron',
        userId: 'user1',
        address: 'Tfake1',
        amountUsdtRaw: '5000000',
        amountChipsCredited: 50000,
        blockNumber: 100,
        creditedAt: '2026-01-01T00:00:00.000Z',
        swept: false,
      },
    ]);

    mockSweepDeposit.mockResolvedValue({ txid: 'sweep-tx-retry' });
    await pollOnce(() => SETTINGS);

    const deposits = getStorage('deposits.json') as Array<{ txid: string; swept: boolean; sweepTxid?: string }>;
    expect(deposits[0].swept).toBe(true);
    expect(deposits[0].sweepTxid).toBe('sweep-tx-retry');
  });
});

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

// Адаптер отдаёт { transfers, scannedToBlock } — второе поле сервис сохраняет как курсор по
// блокам (ROADMAP §9.2). Хелпер, чтобы тесты про сам детектор не повторяли обёртку.
function incoming(transfers: unknown[], scannedToBlock: number | null = 1000) {
  return { transfers, scannedToBlock };
}

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
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx1', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000); // 5 USDT * 10000 центов

    const deposits = getStorage('deposits.json') as Array<{ txid: string }>;
    expect(deposits).toHaveLength(1);
    expect(deposits[0].txid).toBe('tx1');
  });

  it('идемпотентность: повторный pollOnce с тем же txid не кредитует второй раз', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx1', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    await pollOnce(() => SETTINGS);
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000);
    const deposits = getStorage('deposits.json') as Array<{ txid: string }>;
    expect(deposits).toHaveLength(1);
  });

  it('неподтверждённый перевод (confirmed=false) не кредитуется', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx2', amountRaw: 5_000_000n, blockNumber: 100, confirmed: false }]));
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
      return incoming([{ txid: 'tx3', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]);
    });

    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user2')?.chips).toBe(50000);
    mockWallets.tron = [{ userId: 'user1', chainFamily: 'tron', address: 'Tfake1', derivationIndex: 0, createdAt: '2026-01-01' }];
  });

  it('выключенный payments.enabled — опрос не идёт вообще', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx4', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    await pollOnce(() => ({ ...SETTINGS, enabled: false }));
    expect(mockGetIncoming).not.toHaveBeenCalled();
  });

  it('выключенная конкретная сеть — её адаптер не опрашивается', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx5', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    await pollOnce(() => ({ ...SETTINGS, chains: { ...SETTINGS.chains, tron: { ...SETTINGS.chains.tron, enabled: false } } }));
    expect(mockGetIncoming).not.toHaveBeenCalled();
  });

  it('успешный свип сразу при кредите — deposits.json получает swept:true и sweepTxid', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx6', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    mockSweepDeposit.mockResolvedValue({ txid: 'sweep-tx-1' });

    await pollOnce(() => SETTINGS);

    const deposits = getStorage('deposits.json') as Array<{ txid: string; swept: boolean; sweepTxid?: string }>;
    expect(deposits).toHaveLength(1);
    expect(deposits[0].swept).toBe(true);
    expect(deposits[0].sweepTxid).toBe('sweep-tx-1');
    expect(mockSweepDeposit).toHaveBeenCalledWith('tron', 'Tfake1', 'fake-private-key', 5_000_000n);
  });

  it('неудачный свип — кредит чипов сохраняется, запись остаётся swept:false', async () => {
    mockGetIncoming.mockResolvedValue(incoming([{ txid: 'tx7', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true }]));
    mockSweepDeposit.mockResolvedValue({ error: 'gas-funding-not-confirmed' });

    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000);
    const deposits = getStorage('deposits.json') as Array<{ txid: string; swept: boolean }>;
    expect(deposits[0].swept).toBe(false);
  });

  it('ретрай свипа на следующем тике подхватывает ранее неудачную запись', async () => {
    mockGetIncoming.mockResolvedValue(incoming([]));
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

// Свип ждёт подтверждения фандинга газа до ~60с, а тик планировщика приходит каждые 30с — второй
// тик успевал стартовать ВНУТРИ первого, читал ещё не дописанный deposits.json и начислял тот же
// перевод повторно (ROADMAP §9.2, найдено 2026-08-24).
describe('depositPollingService — наложение циклов опроса', () => {
  const TRANSFER = { txid: 'tx-race', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true };

  // Свип, зависающий до явного release — эмулирует ожидание подтверждения фандинг-транзакции.
  // Виснет только ПЕРВЫЙ вызов: если guard сломается, наложившийся тик пройдёт до конца и тест
  // упадёт по существу (задвоенный кредит), а не по таймауту.
  function deferredSweep() {
    let release: (value: { error: string }) => void = () => {};
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let firstCall = true;
    mockSweepDeposit.mockImplementation(() => {
      if (!firstCall) return Promise.resolve({ error: 'chain-not-configured' });
      firstCall = false;
      markStarted();
      return new Promise((resolve) => { release = resolve; });
    });
    return { started, release: (value: { error: string }) => release(value) };
  }

  it('второй тик во время незавершённого свипа пропускается — чипы не начисляются дважды', async () => {
    mockGetIncoming.mockResolvedValue(incoming([TRANSFER]));
    const sweep = deferredSweep();

    const first = pollOnce(() => SETTINGS);
    await sweep.started; // первый проход застрял внутри свипа

    await pollOnce(() => SETTINGS); // тик планировщика поверх незавершённого прохода

    sweep.release({ error: 'gas-funding-not-confirmed' });
    await first;

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000); // ровно один кредит
    expect(getStorage('deposits.json') as unknown[]).toHaveLength(1);
    expect(mockGetIncoming).toHaveBeenCalledTimes(1); // пропущенный тик не опрашивал сеть
  });

  it('запись депозита попадает в deposits.json ДО завершения свипа', async () => {
    mockGetIncoming.mockResolvedValue(incoming([TRANSFER]));
    const sweep = deferredSweep();

    const first = pollOnce(() => SETTINGS);
    await sweep.started;

    // Свип ещё висит, но перевод уже зафиксирован: рестарт процесса в этот момент не приведёт
    // к повторному зачислению на следующем старте.
    const midFlight = getStorage('deposits.json') as Array<{ txid: string; swept: boolean }>;
    expect(midFlight).toHaveLength(1);
    expect(midFlight[0].txid).toBe('tx-race');
    expect(midFlight[0].swept).toBe(false);

    sweep.release({ error: 'gas-funding-not-confirmed' });
    await first;
  });

  it('после пропущенного тика guard снимается — следующий проход кредитует новый перевод', async () => {
    mockGetIncoming.mockResolvedValue(incoming([TRANSFER]));
    const sweep = deferredSweep();

    const first = pollOnce(() => SETTINGS);
    await sweep.started;
    await pollOnce(() => SETTINGS); // пропущен
    sweep.release({ error: 'gas-funding-not-confirmed' });
    await first;

    mockSweepDeposit.mockReset().mockResolvedValue({ error: 'chain-not-configured' });
    mockGetIncoming.mockResolvedValue(incoming([
      TRANSFER,
      { txid: 'tx-race-2', amountRaw: 3_000_000n, blockNumber: 101, confirmed: true },
    ]));
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(80000); // старый не задвоился, новый зачислен
    expect(getStorage('deposits.json') as unknown[]).toHaveLength(2);
  });

  it('исключение внутри прохода не оставляет guard взведённым', async () => {
    const boom = (): PaymentsSettings => { throw new Error('settings недоступны'); };
    await expect(pollOnce(boom)).rejects.toThrow('settings недоступны');

    mockGetIncoming.mockResolvedValue(incoming([TRANSFER]));
    await pollOnce(() => SETTINGS);

    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'user1')?.chips).toBe(50000);
  });
});

// Курсор по последнему обработанному блоку на адрес (ROADMAP §9.2): без него простой сервера
// дольше окна lookback оставлял диапазон блоков непросмотренным, и депозит терялся молча.
describe('depositPollingService — курсор по блокам', () => {
  const TRANSFER = { txid: 'tx-cursor', amountRaw: 5_000_000n, blockNumber: 100, confirmed: true };

  it('после прохода курсор адреса сохранён на диск', async () => {
    mockGetIncoming.mockResolvedValue(incoming([TRANSFER], 4242));
    await pollOnce(() => SETTINGS);

    expect(getStorage('deposit-cursors.json')).toEqual({ 'tron:Tfake1': 4242 });
  });

  it('сохранённый курсор передаётся адаптеру на следующем тике', async () => {
    mockGetIncoming.mockResolvedValue(incoming([], 4242));
    await pollOnce(() => SETTINGS);
    expect(mockGetIncoming).toHaveBeenLastCalledWith('Tfake1', 19, undefined); // первый опрос — курсора ещё нет

    mockGetIncoming.mockResolvedValue(incoming([], 4300));
    await pollOnce(() => SETTINGS);
    expect(mockGetIncoming).toHaveBeenLastCalledWith('Tfake1', 19, 4242); // продолжаем с сохранённого

    expect(getStorage('deposit-cursors.json')).toEqual({ 'tron:Tfake1': 4300 });
  });

  it('сеть без блочного курсора (scannedToBlock=null) — файл курсоров не заводится', async () => {
    mockGetIncoming.mockResolvedValue(incoming([TRANSFER], null));
    await pollOnce(() => SETTINGS);

    expect(getStorage('deposit-cursors.json')).toBeUndefined();
    const deposits = getStorage('deposits.json') as unknown[];
    expect(deposits).toHaveLength(1); // сам депозит при этом зачислен как обычно
  });

  it('ошибка опроса адреса не двигает его курсор', async () => {
    mockGetIncoming.mockResolvedValue(incoming([], 4242));
    await pollOnce(() => SETTINGS);

    mockGetIncoming.mockRejectedValue(new Error('RPC недоступен'));
    await pollOnce(() => SETTINGS);

    expect(getStorage('deposit-cursors.json')).toEqual({ 'tron:Tfake1': 4242 }); // остался на месте
  });

  it('курсоры разных сетей для одного адреса не перетирают друг друга', async () => {
    setStorage('deposit-cursors.json', { 'ethereum:0xabc': 100, 'bsc:0xabc': 900 });
    mockGetIncoming.mockResolvedValue(incoming([], 4242));
    await pollOnce(() => SETTINGS);

    expect(getStorage('deposit-cursors.json')).toEqual({
      'ethereum:0xabc': 100,
      'bsc:0xabc': 900,
      'tron:Tfake1': 4242,
    });
  });
});

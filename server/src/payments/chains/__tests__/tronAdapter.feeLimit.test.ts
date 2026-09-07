import { describe, it, expect, vi, beforeEach } from 'vitest';

// TRC-20 перевод обязан уходить с явным feeLimit: без него TronWeb ставит нулевой потолок, и при
// нехватке energy у отправителя транзакция отваливается с OUT_OF_ENERGY — то есть выплата игроку
// молча не проходит (ROADMAP §11.1).
const sendSpy = vi.fn<(opts: { feeLimit?: number }) => Promise<string>>();

vi.mock('tronweb', () => {
  class TronWebMock {
    static address = { fromPrivateKey: () => 'TFakeAddress' };
    static isAddress = () => true;
    constructor(_opts: unknown) {}
    contract() {
      return Promise.resolve({
        methods: {
          transfer: () => ({ send: (opts: { feeLimit?: number }) => sendSpy(opts) }),
        },
      });
    }
  }
  return { TronWeb: TronWebMock };
});

const { createTronAdapter } = await import('../tronAdapter.js');

const makeAdapter = (feeLimitSun: number) =>
  createTronAdapter({ fullHost: 'https://api.shasta.trongrid.io', apiKey: null, usdtContractAddress: 'T-fake', feeLimitSun });

describe('tronAdapter.sendUsdt — feeLimit', () => {
  beforeEach(() => { sendSpy.mockReset().mockResolvedValue('txid-1'); });

  it('передаёт feeLimit из конфигурации, а не пустой объект', async () => {
    await makeAdapter(100_000_000).sendUsdt('pk', 'TTo', 1_000_000n);
    expect(sendSpy).toHaveBeenCalledWith({ feeLimit: 100_000_000 });
  });

  it('лимит настраивается — сеть дорожает, значение поднимается конфигом', async () => {
    await makeAdapter(150_000_000).sendUsdt('pk', 'TTo', 1_000_000n);
    expect(sendSpy).toHaveBeenCalledWith({ feeLimit: 150_000_000 });
  });

  it('возвращает txid перевода', async () => {
    const res = await makeAdapter(100_000_000).sendUsdt('pk', 'TTo', 5n);
    expect(res).toEqual({ txid: 'txid-1' });
  });
});

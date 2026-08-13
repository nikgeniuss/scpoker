import { describe, it, expect, vi, afterEach } from 'vitest';
import { useWalletStore } from './walletStore';
import type { WithdrawalRequest } from '@poker-room/shared';

// P0-фикс critique 2026-08-12: requestWithdrawal раньше не ловил реджект fetch (обрыв сети) —
// исключение улетало необработанным, игрок не узнавал, ушла заявка или нет.

describe('useWalletStore.requestWithdrawal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useWalletStore.setState({ wallet: null, deposits: [], withdrawals: [], loaded: false, loading: false });
  });

  it('обрыв сети (fetch реджектится) — возвращает {ok:false, error}, не бросает исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    const result = await useWalletStore.getState().requestWithdrawal('tok', 'ethereum', 10, '0x' + '1'.repeat(40));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('сервер вернул ошибку (400) — возвращает {ok:false, error} с текстом от сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Сумма ниже минимума' }) } as Response)),
    );

    const result = await useWalletStore.getState().requestWithdrawal('tok', 'ethereum', 1, '0x' + '1'.repeat(40));

    expect(result).toEqual({ ok: false, error: 'Сумма ниже минимума' });
  });

  it('успешный ответ — добавляет заявку в withdrawals', async () => {
    const record: WithdrawalRequest = {
      id: 'w1',
      userId: 'u1',
      username: 'Player',
      chain: 'ethereum',
      amountChips: 1000,
      amountUsdtRaw: '10000000',
      payoutAddress: '0x' + '1'.repeat(40),
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(record) } as Response)));

    const result = await useWalletStore.getState().requestWithdrawal('tok', 'ethereum', 10, record.payoutAddress);

    expect(result.ok).toBe(true);
    expect(useWalletStore.getState().withdrawals[0]).toEqual(record);
  });
});

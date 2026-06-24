import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { PaymentChain, WithdrawalRequest, DepositRecord } from '@poker-room/shared';

export interface WalletChainInfo {
  enabled: boolean;
  address: string | null;
}

export interface WalletInfo {
  enabled: boolean;
  exchangeRateCentsPerUsdt: number;
  minWithdrawalUsdt: number;
  maxWithdrawalUsdt: number;
  chains: Record<PaymentChain, WalletChainInfo>;
}

interface WalletState {
  wallet: WalletInfo | null;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRequest[];
  loaded: boolean;
  loading: boolean;
  fetchWallet: (token: string) => Promise<void>;
  fetchHistory: (token: string) => Promise<void>;
  requestWithdrawal: (
    token: string,
    chain: PaymentChain,
    amountUsdt: number,
    payoutAddress: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

// Кошелёк игрока (ROADMAP §11.1) — депозитные адреса по сетям + история + заявка на вывод.
export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  deposits: [],
  withdrawals: [],
  loaded: false,
  loading: false,

  fetchWallet: async (token) => {
    set({ loading: true });
    try {
      const r = await fetch(`${API_URL}/payments/wallet`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const wallet = (await r.json()) as WalletInfo;
        set({ wallet, loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },

  fetchHistory: async (token) => {
    try {
      const r = await fetch(`${API_URL}/payments/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const data = (await r.json()) as { deposits: DepositRecord[]; withdrawals: WithdrawalRequest[] };
        set({ deposits: data.deposits, withdrawals: data.withdrawals });
      }
    } catch { /* noop */ }
  },

  requestWithdrawal: async (token, chain, amountUsdt, payoutAddress) => {
    const r = await fetch(`${API_URL}/payments/withdraw`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain, amountUsdt, payoutAddress }),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error || 'Ошибка' };
    set({ withdrawals: [data as WithdrawalRequest, ...get().withdrawals] });
    return { ok: true };
  },
}));

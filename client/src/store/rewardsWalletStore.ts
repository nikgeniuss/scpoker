import { create } from 'zustand';
import { API_URL } from '../config/api';

// Единый баланс HUB-коинов (ROADMAP §10.21.6) — собирается из всех источников (рейкбэк/стрик/
// достижения/гонки/рефералка). НЕ путать с useWalletStore (реальный крипто-кошелёк, /api/payments).
interface RewardsWalletState {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  loaded: boolean;
  loadMine: (token: string | null) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useRewardsWalletStore = create<RewardsWalletState>((set) => ({
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  loaded: false,

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/rewards-wallet/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ balance: d.balance, totalEarned: d.totalEarned, totalSpent: d.totalSpent, loaded: true });
    } catch {
      /* ignore */
    }
  },
}));

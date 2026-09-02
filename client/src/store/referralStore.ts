import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор реферальной программы — серверный (ROADMAP §10.21.5). Читает /api/referral/me (свой код +
// счётчики), /admin/referral (конфиг для CRUD). Награда — HUB-коины, разовая по вехе (N раздач
// приглашённого), выплачивается автоматически сервером по расписанию — клейма на клиенте нет.
export interface ReferralInfo {
  enabled: boolean;
  code: string;
  invitedCount: number;
  rewardedCount: number;
  pendingCount: number;
  handsThreshold: number;
  referrerReward: number;
  refereeReward: number;
}

interface ReferralState extends Partial<ReferralInfo> {
  enabled: boolean;
  loaded: boolean;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (
    token: string | null,
    patch: Partial<{ enabled: boolean; handsThreshold: number; referrerReward: number; refereeReward: number }>,
  ) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useReferralStore = create<ReferralState>((set) => ({
  enabled: false,
  loaded: false,

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/referral/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d: ReferralInfo = await r.json();
      set({ ...d, loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/referral', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        handsThreshold: d.handsThreshold,
        referrerReward: d.referrerReward,
        refereeReward: d.refereeReward,
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/referral', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, handsThreshold: d.handsThreshold, referrerReward: d.referrerReward, refereeReward: d.refereeReward });
    } catch {
      /* ignore */
    }
  },
}));

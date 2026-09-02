import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { StreakReward } from '../config/streak';

// Стор визит-бонуса/стрика — серверный (ROADMAP §10.21.2). Читает /api/streak (публично, таблица
// наград), /api/streak/me (свой кабинет: серия/сегодня/текущая награда), /api/admin/streak (полный
// конфиг), пишет через admin PUT. Источник правды — server/data/streak.json. Награды — HUB-коины.
interface StreakState {
  enabled: boolean;
  rewards: StreakReward[];
  // Личный кабинет (loadMine)
  streakDays: number;
  claimedToday: boolean;
  currentReward: number;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: { enabled?: boolean; rewards?: StreakReward[] }) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useStreakStore = create<StreakState>((set) => ({
  enabled: false,
  rewards: [],
  streakDays: 0,
  claimedToday: false,
  currentReward: 0,
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/streak');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, rewards: d.rewards, loaded: true });
    } catch {
      /* сеть — оставляем дефолты */
    }
  },

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/streak/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        rewards: d.rewards,
        streakDays: d.streakDays,
        claimedToday: d.claimedToday,
        currentReward: d.currentReward,
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/streak', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, rewards: d.rewards, loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/streak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, rewards: d.rewards });
    } catch {
      /* ignore */
    }
  },
}));

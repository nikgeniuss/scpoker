import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { RakebackTier } from '../config/rakeback';

// Стор рейкбэка — серверный. Читает /api/rakeback (публично, таблица уровней),
// /api/rakeback/me (свой кабинет: lifetime-рейк/уровень/история), /api/admin/rakeback
// (полный конфиг), пишет через admin PUT. Источник правды — server/data/rakeback.json. Суммы в центах.
export interface RakebackHistoryEntry {
  t: number;
  roomId: string;
  rakeAmount: number;
  payout: number;
  tierName: string;
}

interface RakebackState {
  enabled: boolean;
  tiers: RakebackTier[];
  // Личный кабинет (loadMine)
  lifetimeRake: number;
  totalPaid: number;
  weeklyPaid: number; // кэшбэк за текущее недельное окно (карточка «Кэшбэк недели» на /rewards)
  tier: RakebackTier | null;
  nextTier: RakebackTier | null;
  history: RakebackHistoryEntry[];
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: { enabled?: boolean; tiers?: RakebackTier[] }) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useRakebackStore = create<RakebackState>((set) => ({
  enabled: false,
  tiers: [],
  lifetimeRake: 0,
  totalPaid: 0,
  weeklyPaid: 0,
  tier: null,
  nextTier: null,
  history: [],
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/rakeback');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, tiers: d.tiers, loaded: true });
    } catch {
      /* сеть — оставляем дефолты */
    }
  },

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/rakeback/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        tiers: d.tiers,
        lifetimeRake: d.lifetimeRake,
        totalPaid: d.totalPaid,
        weeklyPaid: d.weeklyPaid ?? 0,
        tier: d.tier,
        nextTier: d.nextTier,
        history: d.history ?? [],
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/rakeback', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, tiers: d.tiers, loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/rakeback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, tiers: d.tiers });
    } catch {
      /* ignore */
    }
  },
}));

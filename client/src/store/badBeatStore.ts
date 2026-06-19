import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { Tier } from '../config/badBeat';

// Стор бэд-бита — серверный (Фаза 1). Читает /api/badbeat (публично) и /api/admin/badbeat (админ),
// пишет через admin-эндпоинты. Источник правды — server/data/badbeat.json. Суммы в центах.
export interface TopUp {
  ts: number;
  amount: number;
  by: string;
}

export interface BadBeatConfig {
  enabled: boolean;
  dropMode: 'bb' | 'percent';
  percent: number;
  triggers: Record<string, string>;
  tiers: Tier[];
}

interface BadBeatState {
  enabled: boolean;
  pool: number;
  dropMode: 'bb' | 'percent';
  percent: number;
  triggers: Record<string, string>;
  tiers: Tier[];
  topups: TopUp[];
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  setEnabled: (token: string | null, v: boolean) => Promise<void>;
  topUp: (token: string | null, amountCents: number) => Promise<void>;
  saveConfig: (token: string | null, patch: Partial<BadBeatConfig>) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useBadBeatStore = create<BadBeatState>((set, get) => ({
  enabled: false,
  pool: 0,
  dropMode: 'bb',
  percent: 0.15,
  triggers: { nlh: 'aaajj', short: 'aaaa' },
  tiers: [],
  topups: [],
  loaded: false,

  // Публичная вьюшка (игрок-view/баннер): пул + флаг + таблица.
  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/badbeat');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, pool: d.pool, tiers: d.tiers, loaded: true });
    } catch {
      /* сеть — оставляем дефолты */
    }
  },

  // Полный конфиг (админка).
  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/badbeat', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        pool: d.pool,
        dropMode: d.dropMode,
        percent: d.percent,
        triggers: d.triggers,
        tiers: d.tiers,
        topups: d.topups ?? [],
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  setEnabled: async (token, v) => {
    set({ enabled: v }); // оптимистично
    await get().saveConfig(token, { enabled: v });
  },

  topUp: async (token, amountCents) => {
    try {
      const r = await fetch(API_URL + '/admin/badbeat/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ amount: amountCents }),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ pool: d.pool, topups: d.topups ?? [] });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/badbeat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        dropMode: d.dropMode,
        percent: d.percent,
        triggers: d.triggers,
        tiers: d.tiers,
      });
    } catch {
      /* ignore */
    }
  },
}));

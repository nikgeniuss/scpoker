import { create } from 'zustand';
import { API_URL } from '../config/api';

// Responsible Gambling (/api/responsible-gambling, ROADMAP §11.2) — личный кабинет лимитов/
// самоисключения/тайм-аута. Админ-тогглы (какие блоки видны игроку) приходят в `config` тут же
// (read-only для игрока) — сами тогглы редактируются в админке через общий /admin/settings.
export interface ResponsibleGamblingConfig {
  depositLimitEnabled: boolean;
  lossLimitEnabled: boolean;
  sessionTimeLimitEnabled: boolean;
  selfExclusionEnabled: boolean;
  timeoutEnabled: boolean;
}

export interface ResponsibleGamblingState {
  depositLimitCents?: number;
  depositLimitPeriod?: 'day' | 'week' | 'month';
  lossLimitCents?: number;
  lossLimitPeriod?: 'day' | 'week' | 'month';
  sessionTimeLimitMinutes?: number;
  selfExcludedUntil?: string;
  timeoutUntil?: string;
}

interface RgStoreState {
  config: ResponsibleGamblingConfig | null;
  state: ResponsibleGamblingState;
  lossThisPeriod: number | null;
  depositThisPeriod: number | null;
  loaded: boolean;
  loadMe: (token: string | null) => Promise<void>;
  saveLimits: (token: string | null, patch: Partial<ResponsibleGamblingState>) => Promise<{ ok: boolean; error?: string }>;
  selfExclude: (token: string | null, duration: '6m' | '1y' | 'permanent') => Promise<{ ok: boolean; error?: string }>;
  timeout: (token: string | null, duration: '24h' | '7d' | '30d') => Promise<{ ok: boolean; error?: string }>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useResponsibleGamblingStore = create<RgStoreState>((set, get) => ({
  config: null,
  state: {},
  lossThisPeriod: null,
  depositThisPeriod: null,
  loaded: false,

  loadMe: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/responsible-gambling/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ config: d.config, state: d.state ?? {}, lossThisPeriod: d.lossThisPeriod, depositThisPeriod: d.depositThisPeriod, loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveLimits: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/responsible-gambling/limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error };
      set({ state: d });
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  selfExclude: async (token, duration) => {
    try {
      const r = await fetch(API_URL + '/responsible-gambling/self-exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ duration }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error };
      set({ state: { ...get().state, selfExcludedUntil: d.until } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  timeout: async (token, duration) => {
    try {
      const r = await fetch(API_URL + '/responsible-gambling/timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ duration }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error };
      set({ state: { ...get().state, timeoutUntil: d.until } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  },
}));

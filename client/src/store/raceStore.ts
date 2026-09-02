import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор лидерборд-гонки — серверный (ROADMAP §10.21.4). Читает /api/race (публично, как
// /api/leaderboard — метрика/призовая таблица/дедлайн периода/история), /admin/race (тот же
// конфиг для CRUD). Награды — HUB-коины, начисляются сервером автоматически по расписанию.
export type RaceMetric = 'hands' | 'pnl';

export interface RacePrizeRow {
  place: number;
  amount: number;
}

export interface RaceWinner {
  userId: string;
  username: string;
  place: number;
  score: number;
  prize: number;
}

export interface RaceHistoryEntry {
  periodStart: number;
  periodEnd: number;
  metric: RaceMetric;
  winners: RaceWinner[];
}

interface RaceState {
  enabled: boolean;
  metric: RaceMetric;
  periodDays: number;
  prizeTable: RacePrizeRow[];
  periodStart: number;
  periodEndsAt: number;
  history: RaceHistoryEntry[];
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (
    token: string | null,
    patch: Partial<{ enabled: boolean; metric: RaceMetric; periodDays: number; prizeTable: RacePrizeRow[] }>,
  ) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useRaceStore = create<RaceState>((set) => ({
  enabled: false,
  metric: 'hands',
  periodDays: 7,
  prizeTable: [],
  periodStart: 0,
  periodEndsAt: 0,
  history: [],
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/race');
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        metric: d.metric,
        periodDays: d.periodDays,
        prizeTable: d.prizeTable ?? [],
        periodStart: d.periodStart,
        periodEndsAt: d.periodEndsAt,
        history: d.history ?? [],
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/race', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        metric: d.metric,
        periodDays: d.periodDays,
        prizeTable: d.prizeTable ?? [],
        periodStart: d.periodStart,
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/race', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, metric: d.metric, periodDays: d.periodDays, prizeTable: d.prizeTable ?? [] });
    } catch {
      /* ignore */
    }
  },
}));

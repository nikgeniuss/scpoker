import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор недельных миссий — серверный (ROADMAP §10.21.3). Читает /api/missions/me (прогресс копится
// счётчиками на сервере и обнуляется в понедельник 00:00 UTC), клеймит через POST /api/missions/claim,
// /admin/missions — сырой каталог для CRUD. Награда — HUB-коины.
export type MissionCondition = 'hands' | 'rake' | 'tournaments';

export interface MissionDef {
  id: string;
  title: string;
  condition: MissionCondition;
  threshold: number;
  rewardAmount: number;
  chestId?: string; // сундук вместо фиксированной награды (ROADMAP §10.21.7)
}

export interface MissionView extends MissionDef {
  progress: number;
  earned: boolean;
  claimed: boolean;
}

interface MissionsState {
  enabled: boolean;
  missions: MissionView[];  // личный кабинет (loadMine)
  periodEnd: number;        // конец текущей недели, epoch ms (0 — ещё не загружено)
  catalog: MissionDef[];    // админ-каталог (loadAdmin)
  loaded: boolean;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: { enabled?: boolean; catalog?: MissionDef[] }) => Promise<void>;
  claim: (token: string | null, id: string) => Promise<{ reward: number; chestTitle?: string } | { error: string } | null>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useMissionsStore = create<MissionsState>((set, get) => ({
  enabled: false,
  missions: [],
  periodEnd: 0,
  catalog: [],
  loaded: false,

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/missions/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, missions: d.missions ?? [], periodEnd: d.periodEnd ?? 0, loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/missions', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/missions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [] });
    } catch {
      /* ignore */
    }
  },

  claim: async (token, id) => {
    if (!token) return null;
    try {
      const r = await fetch(API_URL + '/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) return { error: typeof d.error === 'string' ? d.error : 'unknown' };
      await get().loadMine(token);
      return { reward: d.reward, chestTitle: d.chestTitle };
    } catch {
      return null;
    }
  },
}));

import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор достижений — серверный (ROADMAP §10.21.3). Читает /api/achievements/me (прогресс
// считается на лету сервером, клеймит через POST /api/achievements/claim) и /admin/achievements
// (сырой каталог для CRUD, без earned/claimed — это per-user, админке не нужно). Награда — HUB-коины.
export type AchievementCondition = 'hands' | 'tournamentsPlayed' | 'tournamentWins' | 'lifetimeRake';

export interface AchievementDef {
  id: string;
  title: string;
  condition: AchievementCondition;
  threshold: number;
  rewardAmount: number;
  chestId?: string; // сундук вместо фиксированной награды (ROADMAP §10.21.7)
}

export interface AchievementView extends AchievementDef {
  earned: boolean;
  claimed: boolean;
}

interface AchievementsState {
  enabled: boolean;
  achievements: AchievementView[]; // личный кабинет (loadMine)
  catalog: AchievementDef[]; // админ-каталог (loadAdmin)
  loaded: boolean;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: { enabled?: boolean; catalog?: AchievementDef[] }) => Promise<void>;
  claim: (token: string | null, id: string) => Promise<{ reward: number; chestTitle?: string } | { error: string } | null>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useAchievementsStore = create<AchievementsState>((set, get) => ({
  enabled: false,
  achievements: [],
  catalog: [],
  loaded: false,

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/achievements/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, achievements: d.achievements ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/achievements', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/achievements', {
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
      const r = await fetch(API_URL + '/achievements/claim', {
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

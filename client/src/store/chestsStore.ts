import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { ChestDef } from '@poker-room/shared';

// Стор сундуков (ROADMAP §10.21.7). Публичная часть — /api/chests: только id/название/шансы
// в процентах (веса остаются на сервере), без авторизации, потому что шансы обязаны быть
// открытыми. Админская — /admin/chests: полный каталог с весами для CRUD.
export type { ChestDef } from '@poker-room/shared';

export interface ChestOdds {
  id: string;
  title: string;
  odds: { amount: number; percent: number }[];
}

interface ChestsState {
  enabled: boolean;
  chests: ChestOdds[];    // публичные шансы (loadPublic)
  catalog: ChestDef[];    // админ-каталог с весами (loadAdmin)
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: { enabled?: boolean; chests?: ChestDef[] }) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useChestsStore = create<ChestsState>((set) => ({
  enabled: false,
  chests: [],
  catalog: [],
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/chests');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, chests: d.chests ?? [], loaded: true });
    } catch {
      /* сеть — оставляем дефолты */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/chests', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.chests ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/chests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.chests ?? [] });
    } catch {
      /* ignore */
    }
  },
}));

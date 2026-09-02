import { create } from 'zustand';
import { API_URL } from '../config/api';

interface AkTableState {
  enabled: boolean;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  setEnabled: (token: string | null, v: boolean) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

// Тоггл «показывать ли AK-скин мобильного стола (GameRoom)» — независим от appThemeStore
// (тот переключает chrome/лобби/кошелёк/профиль). Источник правды — server/data/akTable.json.
// Публично читается через /api/ak-table (Layout.tsx), меняется только админом через
// /api/admin/ak-table (SettingsTab.tsx).
export const useAkTableStore = create<AkTableState>((set) => ({
  enabled: false,
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/ak-table');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, loaded: true });
    } catch {
      /* сеть — оставляем дефолт */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/ak-table', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, loaded: true });
    } catch {
      /* ignore */
    }
  },

  setEnabled: async (token, v) => {
    set({ enabled: v }); // оптимистично
    try {
      const r = await fetch(API_URL + '/admin/ak-table', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ enabled: v }),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled });
    } catch {
      /* ignore */
    }
  },
}));

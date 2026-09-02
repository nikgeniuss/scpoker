import { create } from 'zustand';
import { API_URL } from '../config/api';

interface DebugOverlayState {
  enabled: boolean;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  setEnabled: (token: string | null, v: boolean) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

// Тоггл «показывать ли дебаг-оверлей (FPS/PING/NET)» всем игрокам — по умолчанию скрыт.
// Источник правды — server/data/debugOverlay.json. Публично читается через /api/debug-overlay
// (Layout.tsx), меняется только админом через /api/admin/debug-overlay (SettingsTab.tsx).
export const useDebugOverlayStore = create<DebugOverlayState>((set) => ({
  enabled: false,
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/debug-overlay');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, loaded: true });
    } catch {
      /* сеть — оставляем дефолт */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/debug-overlay', { headers: authHeaders(token) });
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
      const r = await fetch(API_URL + '/admin/debug-overlay', {
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

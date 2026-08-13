import { create } from 'zustand';
import { API_URL } from '../config/api';

export type AppTheme = 'poker-hub' | 'ak';

interface AppThemeState {
  theme: AppTheme;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  setTheme: (token: string | null, v: AppTheme) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

// Глобальный тоггл «какой визуальный скин приложения видят все игроки» — poker-hub (текущий,
// тёмный/неоновый) или ak (светлый, по образцу AK Poker). Источник правды — server/data/appTheme.json.
// Публично читается через /api/app-theme (Layout.tsx), меняется только админом через
// /api/admin/app-theme (SettingsTab.tsx). НЕ путать с .theme-classic/.theme-clubgg в index.css —
// та система про фетр стола (GameRoom), полностью независима от этой.
export const useAppThemeStore = create<AppThemeState>((set) => ({
  theme: 'poker-hub',
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/app-theme');
      if (!r.ok) return;
      const d = await r.json();
      set({ theme: d.theme, loaded: true });
    } catch {
      /* сеть — оставляем дефолт */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/app-theme', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ theme: d.theme, loaded: true });
    } catch {
      /* ignore */
    }
  },

  setTheme: async (token, v) => {
    set({ theme: v }); // оптимистично
    try {
      const r = await fetch(API_URL + '/admin/app-theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ theme: v }),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ theme: d.theme });
    } catch {
      /* ignore */
    }
  },
}));

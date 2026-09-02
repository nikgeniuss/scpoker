import { create } from 'zustand';
import { API_URL } from '../config/api';

export type LobbyDesign = 'classic' | 'redesign';

interface LobbyDesignState {
  design: LobbyDesign;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  setDesign: (token: string | null, v: LobbyDesign) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

// Глобальный тоггл «какую версию /lobby видят все игроки» — классика или редизайн.
// Источник правды — server/data/lobbyDesign.json. Публично читается через /api/lobby-design
// (LobbyGate.tsx), меняется только админом через /api/admin/lobby-design (SettingsTab.tsx).
export const useLobbyDesignStore = create<LobbyDesignState>((set) => ({
  design: 'redesign',
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/lobby-design');
      if (!r.ok) return;
      const d = await r.json();
      set({ design: d.design, loaded: true });
    } catch {
      // Сеть — оставляем дефолт, но помечаем loaded, иначе LobbyGate так и останется
      // пустым: он не рендерит ничего, пока design не подгружен (см. LobbyGate.tsx).
      set({ loaded: true });
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/lobby-design', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ design: d.design, loaded: true });
    } catch {
      /* ignore */
    }
  },

  setDesign: async (token, v) => {
    set({ design: v }); // оптимистично
    try {
      const r = await fetch(API_URL + '/admin/lobby-design', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ design: v }),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ design: d.design });
    } catch {
      /* ignore */
    }
  },
}));

import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор инвентаря косметики — серверный (ROADMAP §10.21.11). Читает /api/inventory (публично,
// каталог), /api/inventory/me (владение+экипировка), /admin/inventory (тот же конфиг для CRUD).
// Покупка/экипировка — POST /api/inventory/purchase|equip, оркестрация полностью на сервере
// (см. inventoryService.ts) — тут только UI-обвязка.
export type CosmeticType = 'avatarFrame' | 'title' | 'emoji' | 'tableGlow';
// Экипируемые типы — эмодзи не экипируется (владение само по себе разрешает слать его в
// EmojiPalette, использовать можно сразу несколько купленных эмодзи).
export type EquippableCosmeticType = 'avatarFrame' | 'title' | 'tableGlow';

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  cost: number;
  value: string;
}

interface EquippedState {
  frame?: string;
  title?: string;
  tableGlow?: string;
}

interface InventoryState {
  enabled: boolean;
  catalog: CosmeticItem[];
  owned: string[];
  equipped: EquippedState;
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadMine: (token: string | null) => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: Partial<{ enabled: boolean; catalog: CosmeticItem[] }>) => Promise<void>;
  purchase: (token: string | null, itemId: string) => Promise<{ ok: true } | { error: string }>;
  equip: (
    token: string | null,
    itemId: string | null,
    type: EquippableCosmeticType,
  ) => Promise<{ ok: true } | { error: string }>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useInventoryStore = create<InventoryState>((set) => ({
  enabled: false,
  catalog: [],
  owned: [],
  equipped: {},
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/inventory');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/inventory/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], owned: d.owned ?? [], equipped: d.equipped ?? {}, loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/inventory', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/inventory', {
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

  purchase: async (token, itemId) => {
    if (!token) return { error: 'unauthorized' };
    try {
      const r = await fetch(API_URL + '/inventory/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ itemId }),
      });
      const d = await r.json();
      if (!r.ok) return { error: typeof d.error === 'string' ? d.error : 'unknown' };
      set((s) => ({ owned: [...s.owned, itemId] }));
      return { ok: true };
    } catch {
      return { error: 'network' };
    }
  },

  equip: async (token, itemId, type) => {
    if (!token) return { error: 'unauthorized' };
    try {
      const r = await fetch(API_URL + '/inventory/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ itemId, type }),
      });
      const d = await r.json();
      if (!r.ok) return { error: typeof d.error === 'string' ? d.error : 'unknown' };
      set({ equipped: d.equipped ?? {} });
      return { ok: true };
    } catch {
      return { error: 'network' };
    }
  },
}));

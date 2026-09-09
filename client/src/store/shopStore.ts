import { create } from 'zustand';
import { API_URL } from '../config/api';
import { getDeviceId } from '../lib/deviceId';

// Стор магазина лояльности — серверный (ROADMAP §10.21.6). Читает /api/shop (публично, каталог),
// /admin/shop (тот же конфиг для CRUD). Редемпшн — POST /api/shop/redeem (house-funded вход в
// турнир, оркестрация полностью на сервере — см. loyaltyShopService.ts).
export interface ShopItem {
  id: string;
  title: string;
  cost: number;
  ticketBuyIn: number;
  kind: 'ticket' | 'hudSub';
  subDays: number;
}

interface ShopState {
  enabled: boolean;
  catalog: ShopItem[];
  loaded: boolean;
  loadPublic: () => Promise<void>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: Partial<{ enabled: boolean; catalog: ShopItem[] }>) => Promise<void>;
  redeem: (
    token: string | null,
    itemId: string,
    tournamentId: string,
  ) => Promise<{ ok: true } | { error: string }>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useShopStore = create<ShopState>((set) => ({
  enabled: false,
  catalog: [],
  loaded: false,

  loadPublic: async () => {
    try {
      const r = await fetch(API_URL + '/shop');
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  loadAdmin: async (token) => {
    try {
      const r = await fetch(API_URL + '/admin/shop', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ enabled: d.enabled, catalog: d.catalog ?? [], loaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    try {
      const r = await fetch(API_URL + '/admin/shop', {
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

  redeem: async (token, itemId, tournamentId) => {
    if (!token) return { error: 'unauthorized' };
    try {
      const r = await fetch(API_URL + '/shop/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId(), ...authHeaders(token) },
        body: JSON.stringify({ itemId, tournamentId }),
      });
      const d = await r.json();
      if (!r.ok) return { error: typeof d.error === 'string' ? d.error : 'unknown' };
      return { ok: true };
    } catch {
      return { error: 'network' };
    }
  },
}));

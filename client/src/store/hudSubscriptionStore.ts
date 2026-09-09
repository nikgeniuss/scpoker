import { create } from 'zustand';
import { API_URL } from '../config/api';

// Подписка на HUD соперников (ROADMAP §10.21.13). Сервер решает, отдавать ли чужие VPIP/PFR
// (gameStateSerializer), а этот стор нужен только для UI: показать заглушку в попапе за столом
// и карточку подписки в магазине. Клиентское состояние ничего не открывает — подделка флага
// не даст данных, их просто нет в GameState.
interface HudSubscriptionState {
  mode: 'free' | 'paid';
  active: boolean;
  expiresAt: number | null;
  loaded: boolean;
  load: (token: string | null) => Promise<void>;
  subscribe: (token: string | null, itemId: string) => Promise<{ ok: true } | { error: string }>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useHudSubscriptionStore = create<HudSubscriptionState>((set) => ({
  mode: 'free',
  active: false,
  expiresAt: null,
  loaded: false,

  load: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/shop/subscription', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        mode: d.mode === 'paid' ? 'paid' : 'free',
        active: !!d.active,
        expiresAt: typeof d.expiresAt === 'number' ? d.expiresAt : null,
        loaded: true,
      });
    } catch {
      /* ignore */
    }
  },

  subscribe: async (token, itemId) => {
    if (!token) return { error: 'unauthorized' };
    try {
      const r = await fetch(API_URL + '/shop/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ itemId }),
      });
      const d = await r.json();
      if (!r.ok) return { error: typeof d.error === 'string' ? d.error : 'unknown' };
      set({ active: true, expiresAt: typeof d.expiresAt === 'number' ? d.expiresAt : null });
      return { ok: true };
    } catch {
      return { error: 'network' };
    }
  },
}));

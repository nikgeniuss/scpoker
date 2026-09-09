import { create } from 'zustand';
import { API_URL } from '../config/api';

// Стор депозитного бонуса с отыгрышем рейком (§10.21.9). Читает /api/bonus/me (свой прогресс),
// пишет через /api/bonus/claim (забрать открытое) и /api/admin/deposit-bonus (настройки).
// Источник правды — server/data/deposit-bonus.json. Суммы в единицах валюты бонуса: для 'chips'
// это центы фишек, для 'hub' — HUB-коины.
export type BonusCurrency = 'chips' | 'hub';

export interface DepositBonus {
  id: string;
  currency: BonusCurrency;
  amount: number;
  rakeRequired: number;
  rakeAccrued: number;
  released: number;
  claimed: number;
  grantedAt: number;
  expiresAt: number;
  source: 'first' | 'reload';
}

export interface DepositBonusConfig {
  enabled: boolean;
  currency: BonusCurrency;
  firstPercent: number;
  reloadPercent: number;
  maxBonusAmount: number;
  minDepositChips: number;
  rakeMultiplier: number;
  lifetimeDays: number;
  countTournamentRake: boolean;
}

interface BonusState {
  enabled: boolean;
  currency: BonusCurrency;
  rakeMultiplier: number;
  firstPercent: number;
  reloadPercent: number;
  available: number;
  locked: number;
  totalGranted: number;
  totalClaimed: number;
  bonuses: DepositBonus[];
  loaded: boolean;
  // Админ-конфиг (грузится отдельно, только на вкладке «Награды»)
  config: DepositBonusConfig | null;
  configLoaded: boolean;
  loadMine: (token: string | null) => Promise<void>;
  claim: (token: string | null) => Promise<{ chips: number; hub: number } | { error: string } | null>;
  loadAdmin: (token: string | null) => Promise<void>;
  saveConfig: (token: string | null, patch: Partial<DepositBonusConfig>) => Promise<void>;
}

const authHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: 'Bearer ' + token } : {};

export const useBonusStore = create<BonusState>((set, get) => ({
  enabled: false,
  currency: 'hub',
  rakeMultiplier: 3,
  firstPercent: 0,
  reloadPercent: 0,
  available: 0,
  locked: 0,
  totalGranted: 0,
  totalClaimed: 0,
  bonuses: [],
  loaded: false,
  config: null,
  configLoaded: false,

  loadMine: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/bonus/me', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({
        enabled: d.enabled,
        currency: d.currency,
        rakeMultiplier: d.rakeMultiplier ?? 3,
        firstPercent: d.firstPercent ?? 0,
        reloadPercent: d.reloadPercent ?? 0,
        available: d.available ?? 0,
        locked: d.locked ?? 0,
        totalGranted: d.totalGranted ?? 0,
        totalClaimed: d.totalClaimed ?? 0,
        bonuses: d.bonuses ?? [],
        loaded: true,
      });
    } catch {
      /* сеть — оставляем дефолты */
    }
  },

  claim: async (token) => {
    if (!token) return null;
    try {
      const r = await fetch(API_URL + '/bonus/claim', { method: 'POST', headers: authHeaders(token) });
      const d = await r.json();
      if (!r.ok) return { error: typeof d?.error === 'string' ? d.error : 'claim-failed' };
      // Сервер возвращает пересчитанное состояние — не делаем второй запрос за тем же.
      const s = d.state;
      if (s) {
        set({
          available: s.available ?? 0,
          locked: s.locked ?? 0,
          totalGranted: s.totalGranted ?? 0,
          totalClaimed: s.totalClaimed ?? 0,
          bonuses: s.bonuses ?? [],
        });
      } else {
        await get().loadMine(token);
      }
      return { chips: d.chips ?? 0, hub: d.hub ?? 0 };
    } catch {
      return { error: 'network' };
    }
  },

  loadAdmin: async (token) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/admin/deposit-bonus', { headers: authHeaders(token) });
      if (!r.ok) return;
      const d = await r.json();
      set({ config: d.config ?? null, configLoaded: true });
    } catch {
      /* ignore */
    }
  },

  saveConfig: async (token, patch) => {
    if (!token) return;
    try {
      const r = await fetch(API_URL + '/admin/deposit-bonus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return;
      const d = await r.json();
      set({ config: d });
    } catch {
      /* ignore */
    }
  },
}));

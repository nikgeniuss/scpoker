import { create } from 'zustand';
import { API_URL } from '../config/api';
import type { TournamentInfo, CreateTournamentOptions } from '@poker-room/shared';

type ApiResult<T> = T | { error: string };

interface TournamentState {
  tournaments: TournamentInfo[];
  loaded: boolean;
  fetchTournaments: (token: string) => Promise<void>;
  register: (token: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  unregister: (token: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  createTournament: (token: string, opts: CreateTournamentOptions) => Promise<{ ok: true } | { ok: false; error: string }>;
  cancelTournament: (token: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  forceStartTournament: (token: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

async function postJson<T>(url: string, token: string, body?: unknown): Promise<ApiResult<T>> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) return { error: data.error || 'Ошибка' };
  return data as T;
}

// Турниры (ROADMAP §10 «Турниры», SNG v1). Список — REST-поллинг (без отдельного socket-канала,
// см. план — минимально-инвазивно для v1), как и остальные простые поллинг-сторы (badBeatStore).
export const useTournamentStore = create<TournamentState>((set, get) => ({
  tournaments: [],
  loaded: false,

  fetchTournaments: async (token) => {
    try {
      const r = await fetch(`${API_URL}/tournaments`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const tournaments = (await r.json()) as TournamentInfo[];
        set({ tournaments, loaded: true });
      }
    } catch { /* noop */ }
  },

  register: async (token, id) => {
    const result = await postJson<TournamentInfo>(`${API_URL}/tournaments/${id}/register`, token);
    if ('error' in result) return { ok: false, error: result.error };
    set({ tournaments: get().tournaments.map((t) => (t.id === id ? result : t)) });
    return { ok: true };
  },

  unregister: async (token, id) => {
    const result = await postJson<TournamentInfo>(`${API_URL}/tournaments/${id}/unregister`, token);
    if ('error' in result) return { ok: false, error: result.error };
    set({ tournaments: get().tournaments.map((t) => (t.id === id ? result : t)) });
    return { ok: true };
  },

  createTournament: async (token, opts) => {
    const result = await postJson<TournamentInfo>(`${API_URL}/admin/tournaments`, token, opts);
    if ('error' in result) return { ok: false, error: result.error };
    set({ tournaments: [result, ...get().tournaments] });
    return { ok: true };
  },

  cancelTournament: async (token, id) => {
    const result = await postJson<TournamentInfo>(`${API_URL}/admin/tournaments/${id}/cancel`, token);
    if ('error' in result) return { ok: false, error: result.error };
    set({ tournaments: get().tournaments.map((t) => (t.id === id ? result : t)) });
    return { ok: true };
  },

  forceStartTournament: async (token, id) => {
    const result = await postJson<TournamentInfo>(`${API_URL}/admin/tournaments/${id}/force-start`, token);
    if ('error' in result) return { ok: false, error: result.error };
    set({ tournaments: get().tournaments.map((t) => (t.id === id ? result : t)) });
    return { ok: true };
  },
}));

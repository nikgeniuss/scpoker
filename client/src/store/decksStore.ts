import { create } from 'zustand';
import { API_URL } from '../config/api';

export interface DeckFile {
  filename: string;
  url: string;
}

export interface DeckInfo {
  id: string;
  label: string;
  files: DeckFile[];
  autoMap: Record<string, string>;
  manualMap: Record<string, string>;
  finalMap: Record<string, string>;
  unmappedFiles: string[];
  missingCards: string[];
}

interface DecksState {
  decks: DeckInfo[];
  loaded: boolean;
  loading: boolean;
  loadedAt: number; // cache-bust ключ — меняется при каждой загрузке/перезагрузке
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

// Хранит список колод из images/. Грузится один раз при mount Layout — потом используется в Card.tsx.
export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  loaded: false,
  loading: false,
  loadedAt: 0,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch(API_URL + '/decks');
      if (!res.ok) throw new Error('Failed to fetch decks');
      const decks: DeckInfo[] = await res.json();
      set({ decks, loaded: true, loading: false, loadedAt: Date.now() });
    } catch (err) {
      console.error('Failed to load decks', err);
      set({ loaded: true, loading: false });
    }
  },

  reload: async () => {
    set({ loading: true });
    try {
      const res = await fetch(API_URL + '/decks');
      if (!res.ok) throw new Error('Failed to fetch decks');
      const decks: DeckInfo[] = await res.json();
      set({ decks, loaded: true, loading: false, loadedAt: Date.now() });
    } catch (err) {
      console.error('Failed to reload decks', err);
      set({ loading: false });
    }
  },
}));

export function cardKey(rank: string, suit: string): string {
  return rank + suit[0].toUpperCase();
}

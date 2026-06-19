import { create } from 'zustand';
import { API_URL } from '../config/api';

interface OpponentNotesState {
  notes: Record<string, string>;
  loaded: boolean;
  fetchNotes: (token: string) => Promise<void>;
  setNote: (token: string, targetId: string, text: string) => Promise<void>;
}

// Приватные заметки на оппонентов (ROADMAP §10.10). targetUserId → текст, видны только владельцу.
export const useOpponentNotesStore = create<OpponentNotesState>((set, get) => ({
  notes: {},
  loaded: false,

  fetchNotes: async (token) => {
    if (get().loaded) return;
    try {
      const r = await fetch(`${API_URL}/notes`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const notes = await r.json() as Record<string, string>;
        set({ notes, loaded: true });
      }
    } catch { /* noop */ }
  },

  setNote: async (token, targetId, text) => {
    set((s) => {
      const notes = { ...s.notes };
      if (text.trim()) notes[targetId] = text.trim();
      else delete notes[targetId];
      return { notes };
    });
    try {
      await fetch(`${API_URL}/notes/${targetId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch { /* noop */ }
  },
}));

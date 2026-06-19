import { create } from 'zustand';
import type { InboxNotification } from '@poker-room/shared';
import { API_URL } from '../config/api';

interface InboxState {
  notifications: InboxNotification[];
  unread: number;
  loaded: boolean;
  fetchInbox: (token: string) => Promise<void>;
  addNotification: (n: InboxNotification) => void;
  markRead: (token: string) => Promise<void>;
}

export const useInboxStore = create<InboxState>((set) => ({
  notifications: [],
  unread: 0,
  loaded: false,

  fetchInbox: async (token) => {
    try {
      const r = await fetch(`${API_URL}/inbox`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json() as { notifications: InboxNotification[]; unread: number };
        set({ notifications: d.notifications, unread: d.unread, loaded: true });
      }
    } catch { /* noop */ }
  },

  addNotification: (n) => {
    set(s => ({ notifications: [n, ...s.notifications], unread: s.unread + 1 }));
  },

  markRead: async (token) => {
    try {
      await fetch(`${API_URL}/inbox/read-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })), unread: 0 }));
    } catch { /* noop */ }
  },
}));

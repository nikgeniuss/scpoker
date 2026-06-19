import { create } from 'zustand';
import { disconnectSocket } from '../lib/socket';

interface AuthUser {
  id: string;
  username: string;
  role: string;
  chips?: number; // банкролл; обновляется через socket-event 'bankrollUpdate' + при mount Layout
  publicId?: string; // короткий публичный ID в формате XXXX-XXXX
  country?: string;  // ISO 3166-1 alpha-2 (например, 'RU')
  avatarSeed?: string; // выбранный seed аватара (из AVATAR_PRESETS); не задан = фоллбэк на id
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAdmin: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setChips: (chips: number) => void;
  setAvatarSeed: (seed: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  isAdmin: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).role === 'admin' : false,

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    // Сменили аккаунт/токен (в т.ч. при привязке Telegram с объединением) — старый сокет
    // авторизован под прежним id. Сбрасываем, чтобы следующий getSocket() переподключился
    // под новым токеном (иначе посадка ищет фишки по старому/удалённому id → «нет фишек»).
    disconnectSocket();
    set({ token, user, isAdmin: user.role === 'admin' });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    disconnectSocket();
    set({ token: null, user: null, isAdmin: false });
  },

  setChips: (chips) =>
    set((state) => {
      if (!state.user) return {};
      const updated = { ...state.user, chips };
      localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),

  setAvatarSeed: (avatarSeed) =>
    set((state) => {
      if (!state.user) return {};
      const updated = { ...state.user, avatarSeed };
      localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),
}));

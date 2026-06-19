import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useClubStore, type MyClub } from '../store/clubStore';
import { API_URL } from '../config/api';

export type { MyClub };

// Module-level guards — дедупликация параллельных вызовов из Layout / MainMenu / MyClubAdmin.
let _inflight = false;
let _lastToken: string | null = null;

export function useMyClub() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { myClub, loading, initialized, setMyClub, setLoading, setInitialized } = useClubStore();

  const refresh = useCallback(async () => {
    if (_inflight) return;
    if (!token || !user) {
      setMyClub(null);
      setInitialized(true);
      return;
    }
    _inflight = true;
    setLoading(true);
    try {
      const r = await fetch(API_URL + '/clubs/my', {
        headers: { Authorization: 'Bearer ' + token },
      });
      setMyClub(r.status === 404 ? null : r.ok ? await r.json() : null);
    } catch {
      setMyClub(null);
    } finally {
      _inflight = false;
      setLoading(false);
      setInitialized(true);
    }
  // Zustand setters стабильны — в deps не включаем
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  useEffect(() => {
    if (token !== _lastToken) {
      _lastToken = token;
      void refresh();
    }
  }, [token, refresh]);

  return { myClub, loading, initialized, refresh };
}

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config/api';
import { useAuthStore } from '../store/authStore';

export interface ProfileStats {
  hands: number;
  wins: number;
  roiPercent: number | null; // null — турнирных входов не было, ROI считать не из чего
  tableMinutes: number;
}

// Блок статистики профиля (/api/profile/stats): руки/победы за всё время, ROI по турнирам,
// минуты за столом. Один запрос вместо трёх — все три метрики нужны одному экрану.
export function useProfileStats() {
  const token = useAuthStore(s => s.token);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch(`${API_URL}/profile/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: ProfileStats | null) => { if (mounted.current) { setStats(d); setLoading(false); } })
      .catch(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [token]);

  return { stats, loading };
}

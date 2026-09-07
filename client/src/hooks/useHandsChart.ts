import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config/api';
import { useAuthStore } from '../store/authStore';

export interface ChartPoint { t: number; cumPnL: number; }

// Кумулятивный график PnL текущего игрока + производные (руки сыграно, итоговый PnL).
// Потребитель — PokerCraft.tsx (график). Плитки профиля считают руки по lifetime-итогам
// (/api/profile/stats), потому что лог раздач обрезается капом и график может не досчитать.
export function useHandsChart() {
  const token = useAuthStore(s => s.token);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch(`${API_URL}/hands/chart`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((d: ChartPoint[]) => { if (mounted.current) { setData(d); setLoading(false); } })
      .catch(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [token]);

  const totalHands = data.length;
  const totalPnL = data.length ? data[data.length - 1].cumPnL : 0;

  return { data, totalHands, totalPnL, loading };
}

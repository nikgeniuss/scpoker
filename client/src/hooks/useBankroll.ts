import { useEffect, useState } from 'react';
import { API_URL } from '../config/api';

// Загрузка актуального банкролла (GET /auth/me) — нужен для верхней границы slider'а бай-ина.
// onLoaded вызывается с актуальными фишками (для дефолта суммы). Вынесено из BuyInModal (§9.3-E).
export function useBankroll(onLoaded?: (chips: number) => void) {
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(API_URL + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : Promise.reject('http ' + r.status)))
      .then((data: { user: { chips?: number } }) => {
        const chips = data.user?.chips ?? 0;
        setBankroll(chips);
        onLoaded?.(chips);
      })
      .catch((e) => setLoadError(String(e)));
    // onLoaded modal-scoped (captures стабильные maxBuyIn/setAmount), эффект только на mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bankroll, loadError };
}

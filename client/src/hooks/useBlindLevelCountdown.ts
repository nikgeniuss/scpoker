import { useEffect, useState } from 'react';

// Обратный отсчёт до следующего уровня блайндов (турнирный HUD под общими картами на столе).
// Тикает раз в секунду, только пока nextLevelAt задан — undefined значит лестница блайндов уже
// кончилась (см. tournamentSchedule.ts), считать нечего.
export function useBlindLevelCountdown(nextLevelAt: number | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (nextLevelAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextLevelAt]);

  if (nextLevelAt === undefined) return null;
  const secLeft = Math.max(0, Math.round((nextLevelAt - now) / 1000));
  const m = Math.floor(secLeft / 60);
  const s = secLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

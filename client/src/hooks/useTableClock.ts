import { useEffect, useState } from 'react';
import type { GameState } from '@poker-room/shared';

// Единый тикер стола: один setInterval(200ms) на обратный отсчёт автостарта, таймер хода
// и таймбанк-фазу. Считает производные секунды/проценты от общего `now` и пробрасывает в seats.
// Раньше всё это жило инлайном в GameRoom (ROADMAP §9.3-E).
export interface TableClock {
  countdownSec: number;
  turnSecondsLeft: number | null;
  timebankSecondsLeft: number | null;
  turnPercent: number | null;
  timebankPercent: number | null;
}

export function useTableClock(state: GameState | null, countdownEndsAt: number | null): TableClock {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Тикаем когда идёт обратный отсчёт автостарта, основной таймер хода или таймбанк-фаза
    const turnEndsAt = state?.turnEndsAt ?? null;
    const tbEndsAt = state?.turnTimebankEndsAt ?? null;
    if (countdownEndsAt === null && turnEndsAt === null && tbEndsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [countdownEndsAt, state?.turnEndsAt, state?.turnTimebankEndsAt]);

  const countdownSec =
    countdownEndsAt !== null ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000)) : 0;
  const turnSecondsLeft =
    state?.turnEndsAt != null ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000)) : null;
  const timebankSecondsLeft =
    state?.turnTimebankEndsAt != null
      ? Math.max(0, Math.ceil((state.turnTimebankEndsAt - now) / 1000))
      : null;
  // Процент для прогресс-кольца таймера.
  const turnPercent =
    state?.turnEndsAt != null && state.turnDurationSec > 0
      ? Math.max(0, Math.min(100, ((state.turnEndsAt - now) / (state.turnDurationSec * 1000)) * 100))
      : null;
  const timebankPercent =
    state?.turnTimebankEndsAt != null && state?.turnTimebankStartedAt != null
      ? Math.max(
          0,
          Math.min(
            100,
            ((state.turnTimebankEndsAt - now) /
              Math.max(1, state.turnTimebankEndsAt - state.turnTimebankStartedAt)) *
              100,
          ),
        )
      : null;

  return { countdownSec, turnSecondsLeft, timebankSecondsLeft, turnPercent, timebankPercent };
}

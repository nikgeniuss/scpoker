import { useEffect, useRef, useState } from 'react';
import type { GamePhase, GameState } from '@poker-room/shared';

// Сервер сбрасывает player.currentBet в НУЛЬ в тот же тик, что и смену фазы (см.
// GameManager.advancePhase) — клиент никогда не видит промежуточное состояние «новая фаза,
// старые ставки». Поэтому фишки на фетре пришлось бы просто мгновенно прятать. Этот хук ловит
// момент смены фазы и на короткое время хранит СНЯТЫЙ ДО обнуления снэпшот ставок — по нему
// GameRoom рисует анимацию «фишки едут в банк», после чего снэпшот сам очищается.
const SWEEP_DURATION_MS = 900;

export function useBetSweepAnimation(state: GameState | null): Record<string, number> {
  const [sweepingBets, setSweepingBets] = useState<Record<string, number>>({});
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const lastBetsRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cur = state?.phase ?? null;
    const prev = prevPhaseRef.current;
    if (prev && cur && prev !== cur) {
      const bets = lastBetsRef.current;
      if (Object.values(bets).some((v) => v > 0)) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setSweepingBets(bets);
        timerRef.current = setTimeout(() => {
          setSweepingBets({});
          timerRef.current = null;
        }, SWEEP_DURATION_MS);
      }
    }
    prevPhaseRef.current = cur;
    lastBetsRef.current = state ? Object.fromEntries(state.players.map((p) => [p.id, p.currentBet])) : {};
  }, [state]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return sweepingBets;
}

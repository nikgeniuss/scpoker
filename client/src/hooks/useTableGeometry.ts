import { useMemo } from 'react';
import type { GameState } from '@poker-room/shared';
import type { PlayerView } from '../components/game/PlayerSeat';
import { buildSeatLayout, type SeatPos } from '../utils/seatLayout';

// Рассадка игроков: desktop (эллипс, считается формулой) и mobile (PRESETS из seatLayout).
// В обоих me — индекс 0, остальные по часовой стрелке. Вынесено из GameRoom (ROADMAP §9.3-E).
export type PlacedSeat = SeatPos & { player: PlayerView };

export function useTableGeometry(
  state: GameState | null,
  me: PlayerView | null,
): { seatPositions: PlacedSeat[]; mobileSeatPositions: PlacedSeat[] } {
  // Desktop: эллипс rx=40 ry=34 (seat), chip rx=22 ry=20, dealer-бейдж rx=37 ry=31.
  const seatPositions = useMemo<PlacedSeat[]>(() => {
    if (!state) return [];
    const count = state.players.length;
    const ordered: PlayerView[] = [];
    const myIdx = me ? state.players.findIndex((p) => p.id === me.id) : -1;
    if (myIdx >= 0) {
      for (let i = 0; i < count; i++) {
        ordered.push(state.players[(myIdx + i) % count]);
      }
    } else {
      ordered.push(...state.players);
    }
    return ordered.map((player, k) => {
      const angle = (Math.PI / 2) + (k * 2 * Math.PI) / count;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        player,
        left: 50 + 40 * cos,
        top: 50 + 34 * sin,
        chipLeft: 50 + 22 * cos,
        chipTop: 50 + 20 * sin,
        dealerLeft: 50 + 37 * cos,
        dealerTop: 50 + 31 * sin,
      };
    });
  }, [state, me]);

  // Mobile: таблица PRESETS из utils/seatLayout.ts (seats сидят НА rail-краю).
  const mobileSeatPositions = useMemo<PlacedSeat[]>(() => {
    if (!state || state.players.length === 0) return [];
    const N = state.players.length;
    const layout = buildSeatLayout(N);
    const ordered: PlayerView[] = [];
    const myIdx = me ? state.players.findIndex((p) => p.id === me.id) : -1;
    const startIdx = myIdx >= 0 ? myIdx : 0;
    for (let i = 0; i < N; i++) {
      ordered.push(state.players[(startIdx + i) % N]);
    }
    return ordered.map((player, k) => ({ player, ...layout[k] }));
  }, [state, me]);

  return { seatPositions, mobileSeatPositions };
}

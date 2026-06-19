import { useEffect, useRef, useState } from 'react';
import type { FlyChipData } from '../components/game/ChipFlyAnimation';
import type { PlacedSeat } from './useTableGeometry';

// Три фишки на победителя с небольшим разбросом от центра пота.
const SPREADS: [number, number][] = [[-2.5, -2], [0, 2.5], [2.5, -2]];

// Следит за изменением winners null → array и генерирует данные летящих фишек.
// potX/potY — центр пота в % родительского контейнера (50/50 desktop; 50/48 mobile).
export function useChipFlyAnimation(
  winners: string[] | null,
  seatPositions: PlacedSeat[],
  potX = 50,
  potY = 50,
): { flyChips: FlyChipData[]; clearFlyChips: () => void } {
  const [flyChips, setFlyChips] = useState<FlyChipData[]>([]);
  // Защита от повторного запуска для одного и того же winners-массива
  const firedRef = useRef(false);

  useEffect(() => {
    if (!winners || winners.length === 0) {
      setFlyChips([]);
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    const chips: FlyChipData[] = [];
    winners.forEach((winnerId, wi) => {
      const seat = seatPositions.find((s) => s.player.id === winnerId);
      if (!seat) return;
      SPREADS.forEach(([sx, sy], i) => {
        chips.push({
          id: `fly-${winnerId}-${i}`,
          fromLeft: potX + sx * 0.4,
          fromTop: potY + sy * 0.4,
          toLeft: seat.left,
          toTop: seat.top,
          delay: wi * 0.15 + i * 0.07,
        });
      });
    });

    if (chips.length > 0) setFlyChips(chips);
  }, [winners, seatPositions, potX, potY]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFlyChips = () => setFlyChips([]);
  return { flyChips, clearFlyChips };
}

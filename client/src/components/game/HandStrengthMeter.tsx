// Шкала силы руки — сегментированный индикатор под подсказкой комбинации (референс AK Poker).
// 9 сегментов = 9 категорий комбинации (старшая карта..стрит-флеш, см. handRankValue на сервере).
// Закрашено слева направо ровно rank сегментов: чем сильнее рука, тем больше закрашено (на самой
// сильной руке закрашены все 9). Закраска — градиент зелёный → жёлтый к текущему рангу.

import { SEGMENTS, filledSegments, segmentColor } from './handStrengthColors';

interface HandStrengthMeterProps {
  rank: number; // 1..9, см. shared Player.handRank
}

export const HandStrengthMeter = ({ rank }: HandStrengthMeterProps) => {
  const filled = filledSegments(rank);
  return (
    <div className="flex items-center gap-[4px]">
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <span
          key={i}
          className="w-[5px] h-[15px] rounded-[1px]"
          style={{ background: i < filled ? segmentColor(i, filled) : 'rgba(255,255,255,0.15)' }}
        />
      ))}
    </div>
  );
};

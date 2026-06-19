import { motion } from 'framer-motion';

// Анимация фишек: летят от pot-центра к победителю (ROADMAP §10.1).
// Паттерн аналогичен DealAnimation — абсолютный оверлей поверх стола, pointer-events-none.
// Все координаты — % родительского контейнера (совпадает с seatPositions/mobileSeatPositions).
export interface FlyChipData {
  id: string;
  fromLeft: number; // %
  fromTop: number;  // %
  toLeft: number;   // %
  toTop: number;    // %
  delay: number;    // секунды
}

export const ChipFlyAnimation = ({
  chips,
  onDone,
}: {
  chips: FlyChipData[];
  onDone?: () => void;
}) => {
  if (chips.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {chips.map((c, i) => (
        <motion.div
          key={c.id}
          className="absolute w-[18px] h-[18px] rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 border border-yellow-200 shadow-md"
          style={{ x: '-50%', y: '-50%' }}
          initial={{ left: c.fromLeft + '%', top: c.fromTop + '%', opacity: 0, scale: 0.5 }}
          animate={{
            left: c.toLeft + '%',
            top: c.toTop + '%',
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.1, 1, 0.4],
          }}
          transition={{
            delay: c.delay,
            duration: 0.6,
            ease: 'easeOut',
            opacity: { delay: c.delay, duration: 0.65, times: [0, 0.08, 0.72, 1] },
            scale: { delay: c.delay, duration: 0.65, times: [0, 0.12, 0.68, 1] },
          }}
          onAnimationComplete={i === chips.length - 1 ? onDone : undefined}
        />
      ))}
    </div>
  );
};

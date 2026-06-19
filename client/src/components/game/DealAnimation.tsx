import { motion } from 'framer-motion';
import type { DealCard } from './dealLayout';

// Градиенты рубашки — зеркало BACK_BG в Card.tsx (мелкая летящая карта, без узора).
const BACK_GRAD: Record<string, string> = {
  'classic-blue': 'from-blue-700 to-blue-900',
  'red-ornament': 'from-red-700 to-red-900',
  gold: 'from-yellow-500 to-yellow-700',
};

// Анимация раздачи (ROADMAP §10.1): карты «вылетают» от дилера к игрокам в два круга.
// Одноразовый оверлей поверх стола — по завершении последней карты вызывает onDone,
// родитель размонтирует. pointer-events-none — игре не мешает.
export const DealAnimation = ({
  cards,
  backStyle,
  onDone,
}: {
  cards: DealCard[];
  backStyle: string;
  onDone: () => void;
}) => {
  const grad = BACK_GRAD[backStyle] || BACK_GRAD['classic-blue'];
  if (cards.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {cards.map((c, i) => (
        <motion.div
          key={c.id}
          className={'absolute w-[22px] h-[31px] rounded-[3px] bg-gradient-to-br ' + grad + ' ring-1 ring-white/20 shadow-md'}
          style={{ x: '-50%', y: '-50%' }}
          initial={{ left: c.fromLeft + '%', top: c.fromTop + '%', opacity: 0, scale: 0.75 }}
          animate={{ left: c.toLeft + '%', top: c.toTop + '%', opacity: [0, 1, 1, 0], scale: 1 }}
          transition={{
            delay: c.delay,
            duration: 0.42,
            ease: 'easeOut',
            opacity: { delay: c.delay, duration: 0.5, times: [0, 0.2, 0.78, 1] },
          }}
          onAnimationComplete={i === cards.length - 1 ? onDone : undefined}
        />
      ))}
    </div>
  );
};

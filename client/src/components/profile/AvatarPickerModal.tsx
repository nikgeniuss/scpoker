import { motion, useMotionValue, useTransform, animate, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ReactNiceAvatar from 'react-nice-avatar';
import { X } from 'lucide-react';
import { AVATAR_PRESETS } from '@poker-room/shared';
import { avatarConfig } from '../../utils/avatar';

// Карусель выбора аватара: 3 ряда × 10 колонок, листается по горизонтали свайпом/драгом.
// «Изогнутый монитор»: центр (под пальцем) — дальше от зрителя, края — ближе (concave-эффект),
// за счёт rotateY + translateZ(z) на каждой колонке, считанных от расстояния до центра.
const COLUMNS = AVATAR_PRESETS.length / 3;
const COLUMN_WIDTH = 96;
const TILE_SIZE = 64;
const ANGLE_STEP = 14;  // градусов на 1 колонку расстояния от центра
const MAX_ANGLE = 60;
const Z_STEP = 52;      // px translateZ на 1 колонку расстояния — края «выезжают» к зрителю
const MAX_Z = 230;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// col[i] = [AVATAR_PRESETS[i], [i+COLUMNS], [i+COLUMNS*2]] — 3 ряда в каждой колонке
const COLUMN_DATA: string[][] = Array.from({ length: COLUMNS }, (_, i) => [
  AVATAR_PRESETS[i],
  AVATAR_PRESETS[i + COLUMNS],
  AVATAR_PRESETS[i + COLUMNS * 2],
]);

interface AvatarPickerModalProps {
  currentSeed: string;
  onClose: () => void;
  onPick: (seed: string) => void;
}

export const AvatarPickerModal = ({ currentSeed, onClose, onPick }: AvatarPickerModalProps) => {
  const { t } = useTranslation();
  const initialIndex = Math.max(0, AVATAR_PRESETS.indexOf(currentSeed));
  const initialColumn = initialIndex % COLUMNS;
  const x = useMotionValue(-initialColumn * COLUMN_WIDTH);
  const minX = -(COLUMNS - 1) * COLUMN_WIDTH;

  const handleDragEnd = () => {
    const nearestColumn = clamp(Math.round(-x.get() / COLUMN_WIDTH), 0, COLUMNS - 1);
    animate(x, -nearestColumn * COLUMN_WIDTH, { type: 'spring', stiffness: 300, damping: 30 });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-emerald-500/30 rounded-3xl p-5 w-full max-w-sm"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{t('avatarPickerModal.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div
          className="relative mx-auto overflow-hidden select-none"
          style={{ width: COLUMN_WIDTH * 3, height: (TILE_SIZE + 14) * 3 }}
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: minX, right: 0 }}
            dragElastic={0.08}
            onDragEnd={handleDragEnd}
            style={{
              x,
              position: 'absolute',
              left: '50%',
              marginLeft: -COLUMN_WIDTH / 2,
              top: 0,
              height: '100%',
              display: 'flex',
            }}
          >
            {COLUMN_DATA.map((seeds, i) => (
              <CarouselColumn key={i} index={i} x={x} seeds={seeds} currentSeed={currentSeed} onPick={onPick} />
            ))}
          </motion.div>
        </div>
        <p className="text-center text-xs text-gray-500 mt-3">{t('avatarPickerModal.hint')}</p>
      </motion.div>
    </motion.div>
  );
};

interface CarouselColumnProps {
  index: number;
  x: MotionValue<number>;
  seeds: string[];
  currentSeed: string;
  onPick: (seed: string) => void;
}

const CarouselColumn = ({ index, x, seeds, currentSeed, onPick }: CarouselColumnProps) => {
  const distance = useTransform(x, (v) => index * COLUMN_WIDTH + v);
  const rotateY = useTransform(distance, (d) => clamp(-(d / COLUMN_WIDTH) * ANGLE_STEP, -MAX_ANGLE, MAX_ANGLE));
  const z = useTransform(distance, (d) => clamp(Math.abs(d / COLUMN_WIDTH) * Z_STEP, 0, MAX_Z));
  const opacity = useTransform(distance, (d) => clamp(1 - Math.max(0, Math.abs(d / COLUMN_WIDTH) - 2.2) * 0.5, 0.15, 1));

  return (
    <motion.div
      style={{ width: COLUMN_WIDTH, rotateY, z, opacity, transformPerspective: 900 }}
      className="flex flex-col items-center justify-center gap-3 shrink-0"
    >
      {seeds.map((seed) => (
        <button
          key={seed}
          onClick={() => onPick(seed)}
          className={
            'rounded-full overflow-hidden shrink-0 transition-shadow ' +
            (seed === currentSeed ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/40' : 'ring-1 ring-white/10')
          }
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
        >
          <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(seed)} />
        </button>
      ))}
    </motion.div>
  );
};

import { memo } from 'react';
import { motion } from 'framer-motion';
import { CHIP_COLOR } from './seatColors';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';

interface Props {
  amount: number;
  bigBlind: number;
  displayMode: ChipDisplay;
  chipStyle: string;
}

// Высота стопки — логарифм от количества ББ. Минимум 1, максимум 6 кружков.
function stackCount(amount: number, bigBlind: number): number {
  if (amount <= 0) return 0;
  if (bigBlind <= 0) return 1;
  const bb = amount / bigBlind;
  if (bb < 1) return 1;
  if (bb < 3) return 2;
  if (bb < 8) return 3;
  if (bb < 20) return 4;
  if (bb < 60) return 5;
  return 6;
}

const ChipStackImpl = ({ amount, bigBlind, displayMode, chipStyle }: Props) => {
  if (amount <= 0) return null;
  const count = stackCount(amount, bigBlind);
  const chipBg = CHIP_COLOR[chipStyle] || CHIP_COLOR.classic;
  const label = formatChips(amount, bigBlind, displayMode);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="flex flex-col items-center pointer-events-none select-none gap-0.5"
    >
      {/* Стопка фишек — диски 24×7px с белым ring + drop-shadow, читается на felt'е */}
      <div className="relative w-6 h-6">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={
              'poker-chip-disc absolute left-0 right-0 mx-auto w-6 h-[7px] rounded-full ring-1 ring-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.6)] ' +
              chipBg
            }
            style={{ bottom: i * 4 }}
          />
        ))}
      </div>
      {/* Подпись — золотой акцент (amber-300) на чёрной плашке, как «Общий банк 4 ББ» у ClubGG */}
      <div className="px-1.5 py-[1px] rounded-md bg-black/75 text-amber-300 text-[11px] font-bold tabular-nums whitespace-nowrap shadow">
        {label}
      </div>
    </motion.div>
  );
};

export const ChipStack = memo(ChipStackImpl);

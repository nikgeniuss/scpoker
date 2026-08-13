import { memo } from 'react';
import { motion } from 'framer-motion';
import { Chip } from './Chip';
import { breakIntoChipGroups } from '../../config/chipDenoms';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';

interface Props {
  amount: number;
  bigBlind: number;
  displayMode: ChipDisplay;
  hideLabel?: boolean; // без числовой подписи — когда сумма уже показана рядом текстом (напр. банк)
}

const SIZE = 20; // px на фишку
const OFFSET = 4; // вертикальный сдвиг в стопке одного номинала
const VIS_CAP = 6; // макс. видимых фишек в одной стопке (сумма всегда точна в подписи)

// Ставка/банк = набор стопок по номиналам (крупные слева), как реальные фишки на столе.
// Номиналы — фиксированная лестница до 1 цента → собирается ЛЮБАЯ сумма точно.
const ChipStackImpl = ({ amount, bigBlind, displayMode, hideLabel }: Props) => {
  if (amount <= 0) return null;
  const groups = breakIntoChipGroups(amount);
  const label = formatChips(amount, bigBlind, displayMode);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="flex flex-col items-center pointer-events-none select-none gap-0.5"
    >
      <div className="flex items-end gap-[3px]">
        {groups.map((g, gi) => {
          const n = Math.min(g.count, VIS_CAP);
          const h = SIZE + (n - 1) * OFFSET;
          return (
            <div key={gi} className="relative" style={{ width: SIZE, height: h }}>
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="absolute left-0" style={{ bottom: i * OFFSET, zIndex: i }}>
                  <Chip color={g.color} value={g.value} size={SIZE} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {/* Подпись — точная сумма, без плашки: только цифра с тенью для читабельности (по запросу) */}
      {!hideLabel && (
        <div className="text-amber-300 text-[11px] font-bold tabular-nums whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
          {label}
        </div>
      )}
    </motion.div>
  );
};

export const ChipStack = memo(ChipStackImpl);

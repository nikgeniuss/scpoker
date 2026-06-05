import { motion } from 'framer-motion';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';

interface Props {
  action: 'fold' | 'check' | 'call' | 'raise' | 'all-in' | string;
  amount?: number;
  bigBlind: number;
  displayMode: ChipDisplay;
}

const STYLE: Record<string, { bg: string; ring: string; label: string }> = {
  fold: {
    bg: 'bg-gradient-to-r from-red-600 to-rose-700',
    ring: 'ring-red-900/40',
    label: 'Фолд',
  },
  check: {
    bg: 'bg-gradient-to-r from-gray-600 to-gray-700',
    ring: 'ring-gray-900/40',
    label: 'Чек',
  },
  call: {
    bg: 'bg-gradient-to-r from-blue-600 to-indigo-700',
    ring: 'ring-blue-900/40',
    label: 'Колл',
  },
  raise: {
    bg: 'bg-gradient-to-r from-emerald-500 to-green-600',
    ring: 'ring-emerald-900/40',
    label: 'Рейз',
  },
  'all-in': {
    bg: 'bg-gradient-to-r from-yellow-500 to-red-600',
    ring: 'ring-orange-900/40',
    label: 'Олл-ин',
  },
};

export const ActionBubble = ({ action, amount, bigBlind, displayMode }: Props) => {
  const s = STYLE[action] || STYLE.fold;
  const showAmount = (action === 'call' || action === 'raise' || action === 'all-in') && amount != null && amount > 0;
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: 8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.6, opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-bold shadow-lg ring-2 whitespace-nowrap ' +
        s.bg +
        ' ' +
        s.ring
      }
    >
      <span>{s.label}</span>
      {showAmount && <span className="font-black">{formatChips(amount!, bigBlind, displayMode)}</span>}
    </motion.div>
  );
};

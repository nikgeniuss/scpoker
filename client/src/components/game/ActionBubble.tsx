import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';

interface Props {
  action: 'fold' | 'check' | 'call' | 'raise' | 'all-in' | string;
  amount?: number;
  bigBlind: number;
  displayMode: ChipDisplay;
  // 'hero' — единый полупрозрачный зелёный стиль (референс AK Poker) для тега действия
  // на своём месте, вместо цвета по типу действия. Текст берётся тот же (labelKey из STYLE).
  variant?: 'default' | 'hero';
}

const STYLE: Record<string, { bg: string; ring: string; labelKey: string }> = {
  fold: {
    bg: 'bg-gradient-to-r from-red-600 to-rose-700',
    ring: 'ring-red-900/40',
    labelKey: 'game.actionFold',
  },
  check: {
    bg: 'bg-gradient-to-r from-gray-600 to-gray-700',
    ring: 'ring-gray-900/40',
    labelKey: 'game.actionCheck',
  },
  call: {
    bg: 'bg-gradient-to-r from-blue-600 to-indigo-700',
    ring: 'ring-blue-900/40',
    labelKey: 'game.actionCall',
  },
  raise: {
    bg: 'bg-gradient-to-r from-emerald-500 to-green-600',
    ring: 'ring-emerald-900/40',
    labelKey: 'game.actionRaise',
  },
  'all-in': {
    bg: 'bg-gradient-to-r from-yellow-500 to-red-600',
    ring: 'ring-orange-900/40',
    labelKey: 'game.actionAllIn',
  },
};

const HERO_STYLE = { bg: 'bg-emerald-600/35 backdrop-blur-sm', ring: 'ring-emerald-400/50' };

export const ActionBubble = ({ action, amount, bigBlind, displayMode, variant = 'default' }: Props) => {
  const { t } = useTranslation();
  const s = STYLE[action] || STYLE.fold;
  const style = variant === 'hero' ? HERO_STYLE : s;
  const showAmount = (action === 'call' || action === 'raise' || action === 'all-in') && amount != null && amount > 0;
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: 8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.6, opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-bold shadow-lg ring-2 whitespace-nowrap ' +
        style.bg +
        ' ' +
        style.ring
      }
    >
      <span>{t(s.labelKey)}</span>
      {showAmount && <span className="font-black">{formatChips(amount!, bigBlind, displayMode)}</span>}
    </motion.div>
  );
};

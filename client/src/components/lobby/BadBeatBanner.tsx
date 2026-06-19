import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { BadBeatLogo } from '../admin/BadBeatLogo';
import { useBadBeatStore } from '../../store/badBeatStore';
import { formatMoney } from '../../config/chipFormat';

// Баннер Bad Beat Jackpot в лобби — вход игрока на /bad-beat. Показывается только когда джекпот включён.
// Пул читается публично (/api/badbeat). Сумма мягко пульсирует неоном.
export const BadBeatBanner = () => {
  const navigate = useNavigate();
  const enabled = useBadBeatStore((s) => s.enabled);
  const pool = useBadBeatStore((s) => s.pool);
  const loadPublic = useBadBeatStore((s) => s.loadPublic);

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  if (!enabled) return null;

  return (
    <motion.button
      onClick={() => navigate('/bad-beat')}
      whileTap={{ scale: 0.99 }}
      whileHover={{ scale: 1.005 }}
      className="w-full mt-3 mb-4 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-fuchsia-500/30 shadow-lg shadow-fuchsia-900/20 overflow-hidden"
    >
      <BadBeatLogo className="h-9 shrink-0" />
      <div className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-fuchsia-300/80 font-bold">
          Бэд-Бит Джекпот
        </span>
        <motion.span
          className="text-xl font-black tabular-nums text-white"
          animate={{
            textShadow: [
              '0 0 6px rgba(217,70,239,0.5)',
              '0 0 14px rgba(34,211,238,0.7)',
              '0 0 6px rgba(217,70,239,0.5)',
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          {formatMoney(pool)}
        </motion.span>
      </div>
      <ChevronRight size={20} className="ml-auto shrink-0 text-gray-400" />
    </motion.button>
  );
};

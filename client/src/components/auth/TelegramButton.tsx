import { motion } from 'framer-motion';

interface TelegramButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  delay?: number;
}

// Переиспользуемая кнопка Telegram (фирменный круглый логотип + подпись).
// Позиционирование задаёт родитель через className. Используется на главной, логине и регистрации.
export const TelegramButton = ({ label, onClick, className = '', delay = 0 }: TelegramButtonProps) => (
  <motion.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={'inline-flex flex-col items-center gap-2 group ' + className}
  >
    {/* Круглый логотип Telegram (фирменный градиент + самолётик) */}
    <span className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-b from-[#37AEE2] to-[#1E96C8] shadow-lg shadow-sky-500/40 group-hover:shadow-xl group-hover:shadow-sky-400/50 transition-shadow">
      <svg viewBox="0 0 240 240" className="w-9 h-9" aria-hidden="true">
        <path
          fill="#fff"
          d="M179.7 56.4 23.5 117.1c-7.3 2.9-7.3 7.1-1.3 8.9l40.1 12.5 15.5 47.7c1.9 5.2 0.9 7.3 6.3 7.3 4.2 0 6.1-1.9 8.4-4.2 1.5-1.5 10.6-10.4 20.8-20.3l43.3 32c8 4.4 13.7 2.1 15.7-7.4l28.4-133.9c2.9-11.6-4.4-16.9-12-13.4Zm-87.4 99.6-2.5 35.3-15.8-49 102.4-64.5c4.5-2.7 8.6-1.2 5.2 1.8Z"
        />
      </svg>
    </span>
    <span className="text-white text-sm font-semibold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>
      {label}
    </span>
  </motion.button>
);

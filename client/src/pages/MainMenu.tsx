import { motion } from 'framer-motion';
import { useTelegram } from '../hooks/useTelegram';

export const MainMenu = () => {
  const { isTelegram } = useTelegram();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      {/* Фон: только картинка, без затемнения (по запросу). */}
      <img
        src="/images/main-bg.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Контент поверх фона */}
      <div className="relative container mx-auto px-4 py-16 flex flex-col items-center justify-end min-h-[calc(100dvh-4rem)]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-center mt-12"
        >
          <div
            className="inline-flex items-center gap-2 text-white/80 text-sm"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
          >
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Online</span>
            <span className="opacity-60">|</span>
            <span>v1.0.0</span>
            <span className="opacity-60">|</span>
            {isTelegram ? (
              <span className="text-blue-300">📱 Telegram Mini App</span>
            ) : (
              <span>🌐 Browser</span>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

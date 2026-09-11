import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Plus, X } from 'lucide-react';

interface Props {
  onCreateRoom: () => void;
}

// Быстрые действия в лобби на телефоне (§10.5). Шапка со «Создать стол» уезжает при прокрутке
// списка, поэтому кнопка появляется только на узких экранах и только когда шапки уже не видно —
// на десктопе и в начале списка она не нужна и не показывается.
const SHOW_AFTER_PX = 240;

export const LobbyFab = ({ onCreateRoom }: Props) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY > SHOW_AFTER_PX;
      setVisible(scrolled);
      if (!scrolled) setOpen(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="md:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2"
        >
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col items-end gap-2"
              >
                <button
                  type="button"
                  onClick={() => { setOpen(false); onCreateRoom(); }}
                  className="flex items-center gap-2 px-4 h-11 rounded-full bg-gray-900/90 backdrop-blur border border-emerald-500/40 text-emerald-300 text-sm font-bold shadow-lg"
                >
                  <Plus size={16} />
                  {t('lobbyFab.createRoom')}
                </button>
                <button
                  type="button"
                  onClick={scrollTop}
                  className="flex items-center gap-2 px-4 h-11 rounded-full bg-gray-900/90 backdrop-blur border border-white/15 text-white/80 text-sm font-bold shadow-lg"
                >
                  <ArrowUp size={16} />
                  {t('lobbyFab.toTop')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            aria-label={open ? t('lobbyFab.close') : t('lobbyFab.open')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center"
          >
            {open ? <X size={22} /> : <Plus size={22} />}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

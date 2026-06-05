import { motion, AnimatePresence } from 'framer-motion';

// 12 эмодзи в сетке 4×3 — объединённый набор (классический + покер-тематический)
const EMOJI_PALETTE = [
  '👍', '❤️', '😂', '😮',
  '😢', '👏', '🔥', '🤔',
  '😎', '🤑', '😠', '🎲',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export const EmojiPalette = ({ open, onClose, onPick }: Props) => (
  <AnimatePresence>
    {open && (
      <>
        {/* Подложка для тапа вне палитры */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-40"
        />
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute top-14 right-4 z-50 bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-2xl p-2 shadow-2xl"
        >
          <div className="grid grid-cols-4 gap-1">
            {EMOJI_PALETTE.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onPick(e);
                  onClose();
                }}
                className="w-10 h-10 flex items-center justify-center text-2xl rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

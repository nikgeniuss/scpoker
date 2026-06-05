import { motion } from 'framer-motion';

interface Props {
  emoji: string;
}

// Большой emoji над аватаром — появляется с подскоком, висит ~2 сек (управляется родителем через AnimatePresence)
export const EmojiBubble = ({ emoji }: Props) => (
  <motion.div
    initial={{ scale: 0, y: 12, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ scale: 0, y: -12, opacity: 0 }}
    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
    className="text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] pointer-events-none select-none"
  >
    {emoji}
  </motion.div>
);

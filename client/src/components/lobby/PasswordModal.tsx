import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, X } from 'lucide-react';

// Модалка ввода пароля приватной комнаты. Вынесено из Lobby (ROADMAP §9.3-E).
interface PasswordModalProps {
  onClose: () => void;
  onSubmit: (password: string) => void;
}

export const PasswordModal = ({ onClose, onSubmit }: PasswordModalProps) => {
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-yellow-500/30 rounded-3xl p-6 w-full max-w-sm"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Lock size={18} className="text-yellow-400" />
            Пароль комнаты
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введи пароль"
            className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-yellow-500"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 font-bold text-white"
          >
            Войти
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTelegram } from '../hooks/useTelegram';
import { tgAppDeepLink } from '../lib/telegram';
import { TelegramButton } from '../components/auth/TelegramButton';

import { API_URL } from '../config/api';

export const Login = () => {
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);
  const { isTelegram } = useTelegram();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const res = await fetch(API_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    const data = await res.json();
    if (res.ok) {
      login(data.token, data.user);
      navigate('/');
    } else {
      setError(data.error);
    }
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <img
        src="/images/front-reg.png"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
        className="bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md mx-4"
      >
        <motion.h2 className="text-3xl font-black mb-6 text-center text-poker-gold">
          Вход
        </motion.h2>

        {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <input type="text" placeholder="Имя пользователя" value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-poker-gold" />
          <input type="password" placeholder="Пароль" value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-poker-gold" />
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            type="submit" className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30">
            Войти
          </motion.button>
        </form>

        <p className="text-gray-400 text-center mt-4 text-sm">
          Нет аккаунта?{' '}
          <span onClick={() => navigate('/register')} className="text-poker-gold cursor-pointer hover:underline">Регистрация</span>
        </p>

        {/* Вход/регистрация через Telegram — открыть Mini App (авто-логин внутри). */}
        {!isTelegram && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 w-full text-gray-500 text-xs">
              <span className="flex-1 h-px bg-white/10" /> или <span className="flex-1 h-px bg-white/10" />
            </div>
            <TelegramButton label="Играть в Telegram" onClick={() => { window.location.href = tgAppDeepLink(); }} />
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
};

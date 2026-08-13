import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useTelegram } from '../hooks/useTelegram';
import { useMyClub } from '../hooks/useMyClub';
import { PageBackground } from '../components/layout/PageBackground';
import { CreateClubModal } from '../components/club/CreateClubModal';
import { JoinClubModal } from '../components/club/JoinClubModal';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import { tgLinkDeepLink, tgAppDeepLink } from '../lib/telegram';
import { TelegramButton } from '../components/auth/TelegramButton';

export const MainMenu = () => {
  const { t } = useTranslation();
  const { isTelegram } = useTelegram();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { myClub, loading: clubLoading, refresh: refreshClub } = useMyClub();
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [showJoinClub, setShowJoinClub] = useState(false);

  const handleLinkTelegram = async () => {
    try {
      const res = await fetch(API_URL + '/auth/link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Не удалось начать привязку');
        return;
      }
      const { code } = await res.json();
      window.location.href = tgLinkDeepLink(code);
    } catch {
      toast.error('Ошибка сети');
    }
  };

  const handleOpenTelegram = () => {
    window.location.href = tgAppDeepLink();
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <PageBackground />

      <div className="relative z-10 container mx-auto px-4 py-16 flex flex-col items-center justify-end min-h-[calc(100dvh-4rem)]">

        {/* Клуб-карточка — только для залогиненных */}
        {user && !clubLoading && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="fixed left-1/2 -translate-x-1/2 top-[28%] z-20 w-full max-w-sm px-4"
          >
            {myClub ? (
              /* Клуб есть — /club сам разрулит владелец/участник */
              <button
                onClick={() => navigate('/club')}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-950/90 border border-emerald-500/30 backdrop-blur-sm hover:border-emerald-400/55 transition-all duration-200 text-left shadow-lg shadow-black/40"
              >
                <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-600/15 border border-emerald-500/30 flex items-center justify-center">
                  <Shield size={22} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate">{myClub.name}</div>
                  <div className="text-gray-500 text-xs mt-0.5">
                    {myClub.members.length} {myClub.members.length === 1 ? 'участник' : myClub.members.length < 5 ? 'участника' : 'участников'}
                    {myClub.pendingRequests.length > 0 && (
                      <span className="ml-2 text-amber-400">· {myClub.pendingRequests.length} заявок</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-gray-500" />
              </button>
            ) : (
              /* Клуба нет — создать или вступить */
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCreateClub(true)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-950/90 border border-white/10 backdrop-blur-sm hover:border-emerald-500/40 transition-all duration-200 text-left shadow-lg shadow-black/40 group"
                >
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-gray-800/80 border border-white/10 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 flex items-center justify-center transition-all duration-200">
                    <Shield size={22} className="text-gray-500 group-hover:text-emerald-400 transition-colors duration-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-300 font-bold text-sm group-hover:text-white transition-colors duration-200">{t('mainMenu.createClub')}</div>
                    <div className="text-gray-600 text-xs mt-0.5">{t('mainMenu.createClubSub')}</div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors duration-200" />
                </button>
                <button
                  onClick={() => setShowJoinClub(true)}
                  className="w-full text-center text-xs text-gray-500 hover:text-emerald-400 py-1.5 transition-colors duration-200"
                >
                  {t('mainMenu.joinClub')}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Telegram-кнопка */}
        {!isTelegram && (
          <TelegramButton
            label={user ? t('mainMenu.linkTelegram') : t('mainMenu.playInTelegram')}
            onClick={user ? handleLinkTelegram : handleOpenTelegram}
            delay={0.6}
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-20"
          />
        )}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 text-center"
        >
          <div
            className="inline-flex items-center gap-2 text-white/80 text-sm"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
          >
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>{t('mainMenu.online')}</span>
            <span className="opacity-60">|</span>
            <span>v1.0.0</span>
            <span className="opacity-60">|</span>
            {isTelegram ? (
              <span className="text-blue-300">{t('mainMenu.telegramMiniApp')}</span>
            ) : (
              <span>{t('mainMenu.browser')}</span>
            )}
          </div>
        </motion.div>
      </div>

      {/* Модалка создания клуба */}
      <AnimatePresence>
        {showCreateClub && (
          <CreateClubModal
            onClose={() => setShowCreateClub(false)}
            onCreated={() => {
              setShowCreateClub(false);
              refreshClub();
              navigate('/my-club');
            }}
          />
        )}
        {showJoinClub && (
          <JoinClubModal
            onClose={() => setShowJoinClub(false)}
            onJoined={() => {
              setShowJoinClub(false);
              refreshClub();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

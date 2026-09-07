import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useTelegram } from '../hooks/useTelegram';
import { useMyClub } from '../hooks/useMyClub';
import { CreateClubModal } from '../components/club/CreateClubModal';
import { JoinClubModal } from '../components/club/JoinClubModal';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import { tgLinkDeepLink, tgAppDeepLink } from '../lib/telegram';
import { TelegramButton } from '../components/auth/TelegramButton';

// AK-скин главного экрана ("/") — светлая fintech-композиция (навy-баннер + белые карточки),
// по образцу референса AK Poker. Функционально повторяет MainMenu.tsx (клуб-карточка,
// Telegram-кнопка, статус-строка), но без фоновой картинки/тёмных неон-акцентов POKER HUB —
// chrome (навбар/таб-бар) рендерит Layout.tsx через AkChrome, тут только контент <main>.
export const AkMainMenu = () => {
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
    <div className="ak-font min-h-[calc(100dvh-4rem)] bg-ak-bg flex flex-col">
      {/* Навy-баннер приветствия — общий AK-язык (референс "Профиль": навy-шапка + акцент) */}
      <div className="relative overflow-hidden bg-ak-navy px-6 pt-8 pb-7 rounded-b-[24px] shrink-0">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-ak-gold/20 blur-2xl pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center"
        >
          <div className="text-2xl font-bold text-white">Добро пожаловать</div>
          {user && <div className="text-white/70 text-sm mt-1 truncate">{user.username}</div>}
        </motion.div>

        {!isTelegram && (
          <div className="relative z-10 flex justify-center mt-5">
            <TelegramButton
              label={user ? t('mainMenu.linkTelegram') : t('mainMenu.playInTelegram')}
              onClick={user ? handleLinkTelegram : handleOpenTelegram}
              delay={0.3}
            />
          </div>
        )}
      </div>

      {/* Клуб-карточка — только для залогиненных, та же логика, что в MainMenu.tsx */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {user && !clubLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="w-full max-w-sm"
          >
            {myClub && (
              /* Клуб есть — /club сам разрулит владелец/участник. Блок «клуба нет»
                 (создать/вступить) убран с главной по запросу. */
              <button
                onClick={() => navigate('/club')}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-ak-card border border-ak-navy/10 shadow-sm hover:border-ak-teal/40 transition-colors duration-200 text-left"
              >
                <div className="shrink-0 w-11 h-11 rounded-xl bg-ak-teal/10 flex items-center justify-center">
                  <Shield size={22} className="text-ak-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-ak-text font-bold text-sm truncate">{myClub.name}</div>
                  <div className="text-ak-text-muted text-xs mt-0.5">
                    {t('mainMenu.clubMembers', { count: myClub.members.length })}
                    {myClub.pendingRequests.length > 0 && (
                      <span className="ml-2 text-ak-gold">· {myClub.pendingRequests.length} заявок</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-ak-text-muted" />
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Статус-строка внизу */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center"
      >
        <div className="inline-flex items-center gap-2 text-ak-text-muted text-sm">
          <span className="w-2 h-2 bg-ak-green rounded-full animate-pulse" />
          <span>{t('mainMenu.online')}</span>
          <span className="opacity-60">|</span>
          <span>v1.0.0</span>
          <span className="opacity-60">|</span>
          {isTelegram ? (
            <span className="text-ak-navy">{t('mainMenu.telegramMiniApp')}</span>
          ) : (
            <span>{t('mainMenu.browser')}</span>
          )}
        </div>
      </motion.div>

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

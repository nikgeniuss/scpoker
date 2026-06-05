import { useTelegram } from '../../hooks/useTelegram';
import { motion } from 'framer-motion';
import { useEffect, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Coins, Home, LayoutGrid, UserCircle, LogOut, Trophy } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDecksStore } from '../../store/decksStore';
import { disconnectSocket } from '../../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import { API_URL } from '../../config/api';
import { useSocketEvent } from '../../hooks/useSocketEvent';

// Кнопка в админку — lazy, грузится только для админа (код не в бандле игрока).
const AdminNavButton = lazy(() => import('../admin/AdminNavButton'));

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout, token, setChips } = useAuthStore();
  const loadDecks = useDecksStore((s) => s.load);
  const { isTelegram, webApp } = useTelegram();

  // Загружаем список колод один раз при mount — нужен Card.tsx для отрисовки картинок вместо текста
  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  // Показ нижнего tab-bar только на mobile + только залогиненным + не на игровом столе/auth-страницах
  const path = location.pathname;
  const isGuestPage = path === '/login' || path === '/register';
  const isGameRoom = path.startsWith('/game/');
  const showBottomBar = !!user && !isGameRoom && !isGuestPage;

  // Стартовое значение банкролла (fetch при логине). Live-обновления — через socket ниже.
  useEffect(() => {
    if (!token || !user?.id) return;
    fetch(API_URL + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: { chips?: number } } | null) => {
        if (data?.user?.chips !== undefined) setChips(data.user.chips);
      })
      .catch(() => {});
  }, [token, user?.id, setChips]);

  // Подписки через useSocketEvent — авто-off при размонтировании, без ручного on/off (§9.3-F).

  // Обновление банкролла (посадка/выход/админ-правки).
  useSocketEvent<{ chips: number }>(
    SOCKET_EVENTS.BANKROLL_UPDATE,
    ({ chips }) => setChips(chips),
    !!token && !!user,
  );

  // forceDisconnect — открыли игру в другой вкладке; сервер рубит этот сокет → сообщение + редирект.
  useSocketEvent(
    SOCKET_EVENTS.FORCE_DISCONNECT,
    () => {
      toast.error('Эта вкладка отключена — игра открыта в другой вкладке', { duration: 5000 });
      disconnectSocket();
      navigate('/lobby');
    },
    !!user,
  );

  // connect_error — сервер отклоняет handshake при невалидном/протухшем JWT ('No token'/'Invalid token'
  // из io.use; см. §11.42). Прочие ошибки (сеть, server down) игнорируем — не logout на каждый сбой связи.
  useSocketEvent<Error>(
    'connect_error',
    (err) => {
      if (err.message === 'Invalid token' || err.message === 'No token') {
        toast.error('Сессия устарела, войдите снова', { duration: 5000 });
        logout();
        navigate('/login');
      }
    },
    !!user,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-poker-green/20 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-900/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2000ms' }} />
      </div>
      
      {/* На /game/ mobile вся Layout navbar скрыта — balance/admin/logout перенесены в GameRoom-бар */}
      <nav className={'fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/50 border-b border-white/10 ' + (isGameRoom ? 'hidden md:block' : '')}>
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xl md:text-2xl font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              onClick={() => navigate('/')}
              title="На главную"
            >
              <span className="text-white/40">♠</span>
              <span className="neon-logo">POKER HUB</span>
            </motion.div>

            {/* Desktop-ссылки: видны только на md+, повторяют bottom tab-bar */}
            {user && (
              <div className="hidden md:flex items-center gap-1">
                <NavLink to="/" label="Главная" active={path === '/'} onClick={() => navigate('/')} />
                <NavLink to="/lobby" label="Лобби" active={path === '/lobby'} onClick={() => navigate('/lobby')} />
                <NavLink to="/tournaments" label="Турниры" active={false} disabled hint="скоро" />
                <NavLink to="/profile" label="Профиль" active={false} disabled hint="скоро" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {isTelegram && (
              <button
                onClick={() => webApp?.close()}
                className="px-3 py-1 bg-white/10 text-white rounded-lg text-sm"
              >
                ← Закрыть
              </button>
            )}
            {user ? (
              <>
                {/* Username скрываем на mobile — ник дублирован в bottom-bar и в game-view */}
                <span className="hidden md:inline text-gray-400 text-sm">{user.username}</span>
                {typeof user.chips === 'number' && (
                  <span
                    title="Свободный банкролл"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs md:text-sm font-bold whitespace-nowrap"
                  >
                    <Coins size={14} /> {user.chips}
                  </span>
                )}
                {isAdmin && (
                  <Suspense fallback={null}>
                    <AdminNavButton onClick={() => navigate('/admin')} />
                  </Suspense>
                )}
                {/* На /game/ Layout-Выйти скрыт на mobile — внутри GameRoom есть своя кнопка
                    «Выйти из стола» (это разные действия: logout vs leaveRoom). На desktop оба видны. */}
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  title="Выйти"
                  className={
                    'flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-red-600 text-white text-sm ' +
                    (isGameRoom ? 'hidden md:flex' : '')
                  }
                >
                  <LogOut size={16} className="md:hidden" />
                  <span className="hidden md:inline">Выйти</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="px-3 md:px-4 py-1 border border-poker-gold text-poker-gold rounded-lg text-sm">
                  Войти
                </button>
                <button onClick={() => navigate('/register')} className="px-3 md:px-4 py-1 bg-poker-gold text-black rounded-lg text-sm font-bold whitespace-nowrap">
                  Регистрация
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* На /game/ mobile padding-top убираем — navbar скрыта, стол занимает весь экран */}
      <main className={(isGameRoom ? 'md:pt-16' : 'pt-16') + ' ' + (showBottomBar ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0' : '')}>
        {/* Раньше тут была AnimatePresence + motion.div с initial:opacity:0/animate:1 (300ms транзит между страницами).
            Парадокс: parent-mostion успешно анимировался к opacity:1, но дочерние motion.* в GameRoom
            (десятки PlayerSeat/Card/ChipStack/Bubble с своими initial={opacity:0}) застревали в initial.
            Симптом: первый mount Lobby → GameRoom = чёрный экран (DOM есть, opacity:0); F5 = ок (нет transition'а).
            Убрал — простые fade'ы не стоят race-condition. */}
        {children}
      </main>

      {showBottomBar && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md bg-black/70 border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-4 h-16">
            <TabButton
              icon={<Home size={20} />}
              label="Главная"
              active={location.pathname === '/'}
              onClick={() => navigate('/')}
            />
            <TabButton
              icon={<LayoutGrid size={20} />}
              label="Лобби"
              active={location.pathname === '/lobby'}
              onClick={() => navigate('/lobby')}
            />
            <TabButton
              icon={<Trophy size={20} />}
              label="Турниры"
              active={false}
              disabled
              hint="скоро"
            />
            <TabButton
              icon={<UserCircle size={20} />}
              label="Профиль"
              active={false}
              disabled
              hint="скоро"
            />
          </div>
        </nav>
      )}
    </div>
  );
};

// Desktop nav-ссылка в верхней панели (повторяет mobile bottom tab-bar)
const NavLink = ({
  label,
  active,
  disabled,
  hint,
  onClick,
}: {
  to: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={
      'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ' +
      (active
        ? 'bg-emerald-500/15 text-emerald-300'
        : disabled
        ? 'text-gray-600 cursor-not-allowed'
        : 'text-gray-300 hover:text-white hover:bg-white/5')
    }
  >
    {label}
    {hint && <span className="ml-1 text-[10px] opacity-60">({hint})</span>}
  </button>
);

const TabButton = ({
  icon,
  label,
  active,
  disabled,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={
      'flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ' +
      (active
        ? 'text-emerald-400'
        : disabled
        ? 'text-gray-600 cursor-not-allowed'
        : 'text-gray-400 hover:text-white')
    }
  >
    {icon}
    <span className="text-[10px] font-bold tracking-wide">
      {label}
      {hint && <span className="ml-1 opacity-60">({hint})</span>}
    </span>
  </button>
);

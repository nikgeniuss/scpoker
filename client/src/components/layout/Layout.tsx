import { motion } from 'framer-motion';
import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Coins, Home, LayoutGrid, UserCircle, LogOut, Trophy, Crown, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMyClub } from '../../hooks/useMyClub';
import { useDecksStore } from '../../store/decksStore';
import { useInboxStore } from '../../store/inboxStore';
import { disconnectSocket } from '../../lib/socket';
import { SOCKET_EVENTS, type InboxNotification } from '@poker-room/shared';
import { API_URL } from '../../config/api';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { formatMoney } from '../../config/chipFormat';
import { TablesManager } from '../game/TablesManager';
import { DebugOverlay } from '../debug/DebugOverlay';

// Кнопки в панели — lazy, код не в бандле обычного игрока.
const AdminNavButton = lazy(() => import('../admin/AdminNavButton'));
const ClubAdminNavButton = lazy(() => import('../admin/ClubAdminNavButton'));
const MyClubNavButton = lazy(() => import('../club/MyClubNavButton'));

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout, token, setChips } = useAuthStore();
  const { myClub } = useMyClub();
  const { unread: inboxUnread, fetchInbox, addNotification } = useInboxStore();
  // Кнопка «Мой клуб» — только не-админ владелец (у администраторов свои вкладки Клуб/Админ)
  const isClubOwner = !!myClub && !!user && myClub.ownerId === user.id && !isAdmin;
  const loadDecks = useDecksStore((s) => s.load);

  // Загружаем список колод один раз при mount — нужен Card.tsx для отрисовки картинок вместо текста
  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  // Показ нижнего tab-bar только на mobile + только залогиненным + не на игровом столе/auth-страницах
  const path = location.pathname;
  const isGuestPage = path === '/login' || path === '/register';
  const isGameRoom = path.startsWith('/game/');
  const showBottomBar = !!user && !isGameRoom && !isGuestPage;

  // Свайп влево/вправо для переключения вкладок нижнего бара
  const tabRoutes = isAdmin
    ? ['/', '/lobby', '/club-admin', '/admin']
    : isClubOwner
      ? ['/', '/lobby', '/my-club']
      : ['/', '/lobby'];
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = tabRoutes.indexOf(path);
    if (idx === -1) return;
    if (dx < 0 && idx < tabRoutes.length - 1) navigate(tabRoutes[idx + 1]);
    else if (dx > 0 && idx > 0) navigate(tabRoutes[idx - 1]);
  }, [navigate, path, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Загрузить inbox при логине.
  useEffect(() => {
    if (token && user?.id) fetchInbox(token);
  }, [token, user?.id, fetchInbox]);

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

  // Входящее уведомление (фишки/бан/broadcast) — добавляем в store и показываем тост.
  useSocketEvent<{ notification: InboxNotification }>(
    SOCKET_EVENTS.INBOX_NOTIFICATION,
    ({ notification }) => {
      addNotification(notification);
      toast(notification.text, { duration: 4000 });
    },
    !!user,
  );

  // Посадка из очереди: место на полном столе освободилось → сервер посадил, переходим за стол.
  // Слушаем глобально (а не только в лобби) — игрок мог уйти на другой экран, пока ждал.
  useSocketEvent<{ roomId: string }>(
    SOCKET_EVENTS.SEAT_FROM_WAITLIST,
    ({ roomId }) => {
      toast.success('Место освободилось — вы за столом!');
      navigate('/game/' + roomId);
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
      {/* Мультитейблинг: персистентный слушатель открытых столов (пилюли). Живёт выше роутов. */}
      <TablesManager />
      <DebugOverlay />
      {/* Фоновые блюр-пятна — дорогие по GPU (полноэкранный blur-3xl + animate-pulse).
          За столом их не видно под непрозрачным полом, поэтому там не рендерим (perf §0.10). */}
      {!isGameRoom && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-poker-green/20 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-900/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2000ms' }} />
        </div>
      )}
      
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
            </motion.div>

            {/* Desktop-ссылки: видны только на md+, повторяют bottom tab-bar */}
            {user && (
              <div className="hidden md:flex items-center gap-1">
                <NavLink to="/" label={t('nav.home')} active={path === '/'} onClick={() => navigate('/')} />
                <NavLink to="/lobby" label={t('nav.lobby')} active={path === '/lobby'} onClick={() => navigate('/lobby')} />
                <NavLink to="/tournaments" label={t('nav.tournaments')} active={path === '/tournaments'} onClick={() => navigate('/tournaments')} />
                <NavLink to="/profile" label={t('nav.profile')} active={path === '/profile'} onClick={() => navigate('/profile')} badge={inboxUnread || undefined} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {user ? (
              <>
                {/* Ник юзера — между логотипом и балансом, видим и на мобиле */}
                <span className="text-gray-300 text-sm max-w-[110px] md:max-w-none truncate">{user.username}</span>
                {typeof user.chips === 'number' && (
                  <span
                    title="Свободный банкролл"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs md:text-sm font-bold whitespace-nowrap"
                  >
                    <Coins size={14} /> {formatMoney(user.chips)}
                  </span>
                )}
                {/* На мобиле admin-кнопки живут в нижнем баре (см. ниже); тут — только десктоп */}
                {isClubOwner && (
                  <div className="hidden md:flex items-center gap-2 md:gap-3">
                    <Suspense fallback={null}>
                      <MyClubNavButton onClick={() => navigate('/my-club')} />
                    </Suspense>
                  </div>
                )}
                {isAdmin && (
                  <div className="hidden md:flex items-center gap-2 md:gap-3">
                    <Suspense fallback={null}>
                      <ClubAdminNavButton onClick={() => navigate('/club-admin')} />
                      <AdminNavButton onClick={() => navigate('/admin')} />
                    </Suspense>
                  </div>
                )}
                {/* На /game/ Layout-Выйти скрыт на mobile — внутри GameRoom есть своя кнопка
                    «Выйти из стола» (это разные действия: logout vs leaveRoom). На desktop оба видны. */}
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  title={t('nav.logout')}
                  className={
                    'flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-red-600 text-white text-sm ' +
                    (isGameRoom ? 'hidden md:flex' : '')
                  }
                >
                  <LogOut size={16} className="md:hidden" />
                  <span className="hidden md:inline">{t('nav.logout')}</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="px-3 md:px-4 py-1 border border-poker-gold text-poker-gold rounded-lg text-sm">
                  {t('nav.login')}
                </button>
                <button onClick={() => navigate('/register')} className="px-3 md:px-4 py-1 bg-poker-gold text-black rounded-lg text-sm font-bold whitespace-nowrap">
                  {t('nav.register')}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* На /game/ mobile padding-top убираем — navbar скрыта, стол занимает весь экран */}
      <main
        className={(isGameRoom ? 'md:pt-16' : 'pt-16') + ' ' + (showBottomBar ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0' : '')}
        onTouchStart={showBottomBar ? handleTouchStart : undefined}
        onTouchEnd={showBottomBar ? handleTouchEnd : undefined}
      >
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
          <div className={'grid h-16 ' + (isAdmin ? 'grid-cols-6' : isClubOwner ? 'grid-cols-5' : 'grid-cols-4')}>
            <TabButton
              icon={<Home size={20} />}
              label={t('nav.home')}
              active={location.pathname === '/'}
              onClick={() => navigate('/')}
            />
            <TabButton
              icon={<LayoutGrid size={20} />}
              label={t('nav.lobby')}
              active={location.pathname === '/lobby'}
              onClick={() => navigate('/lobby')}
            />
            <TabButton
              icon={<Trophy size={20} />}
              label={t('nav.tournaments')}
              active={location.pathname === '/tournaments'}
              onClick={() => navigate('/tournaments')}
            />
            <TabButton
              icon={<UserCircle size={20} />}
              label={t('nav.profile')}
              active={path === '/profile'}
              onClick={() => navigate('/profile')}
              badge={inboxUnread || undefined}
            />
            {/* Кнопка владельца клуба — только не-admin владельцам */}
            {!isAdmin && isClubOwner && (
              <TabButton
                icon={<Crown size={20} />}
                label={t('nav.myClub')}
                active={location.pathname.startsWith('/my-club')}
                onClick={() => navigate('/my-club')}
              />
            )}
            {/* Admin-only: видны только админам (исходно были в верхней панели). */}
            {isAdmin && (
              <>
                <TabButton
                  icon={<Crown size={20} />}
                  label={t('nav.club')}
                  active={location.pathname.startsWith('/club-admin')}
                  onClick={() => navigate('/club-admin')}
                />
                <TabButton
                  icon={<Shield size={20} />}
                  label={t('nav.admin')}
                  active={location.pathname === '/admin'}
                  onClick={() => navigate('/admin')}
                />
              </>
            )}
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
  badge,
  onClick,
}: {
  to: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  badge?: number;
  onClick?: () => void;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={
      'relative px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ' +
      (active
        ? 'bg-emerald-500/15 text-emerald-300'
        : disabled
        ? 'text-gray-600 cursor-not-allowed'
        : 'text-gray-300 hover:text-white hover:bg-white/5')
    }
  >
    {label}
    {hint && <span className="ml-1 text-[10px] opacity-60">({hint})</span>}
    {!!badge && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

const TabButton = ({
  icon,
  label,
  active,
  disabled,
  hint,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  badge?: number;
  onClick?: () => void;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={
      'relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-0 px-0.5 transition-all duration-200 ' +
      (active
        ? 'text-emerald-300 [filter:drop-shadow(0_0_4px_#34d399)_drop-shadow(0_0_10px_#10b981)]'
        : disabled
        ? 'text-gray-600 cursor-not-allowed'
        : 'text-gray-400 hover:text-emerald-200 hover:[filter:drop-shadow(0_0_5px_rgba(52,211,153,0.6))]')
    }
  >
    <div className="relative">
      {icon}
      {!!badge && (
        <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
    <span className="text-[10px] font-bold tracking-wide max-w-full truncate">
      {label}
      {hint && <span className="ml-1 opacity-60">({hint})</span>}
    </span>
  </button>
);

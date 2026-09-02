import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useTournamentStore } from '../../store/tournamentStore';
import { useDecksStore } from '../../store/decksStore';
import { useInboxStore } from '../../store/inboxStore';
import { useAppThemeStore } from '../../store/appThemeStore';
import { useAkTableStore } from '../../store/akTableStore';
import { useDebugOverlayStore } from '../../store/debugOverlayStore';
import { disconnectSocket } from '../../lib/socket';
import { SOCKET_EVENTS, type InboxNotification, type TournamentResultPayload } from '@poker-room/shared';
import { API_URL } from '../../config/api';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { TablesManager } from '../game/TablesManager';
import { DebugOverlay } from '../debug/DebugOverlay';
import { TournamentResultModal } from '../lobby/TournamentResultModal';
import { PokerHubChrome } from './PokerHubChrome';
import { AkChrome } from './AkChrome';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout, token, setChips } = useAuthStore();
  const { unread: inboxUnread, fetchInbox, addNotification } = useInboxStore();
  const [tournamentResult, setTournamentResult] = useState<TournamentResultPayload | null>(null);
  // Кнопка «Клуб» (/club) — видна любому не-админ игроку (владелец/участник/без клуба —
  // ветвление внутри ClubHome); у администраторов свои вкладки Клуб(room-admin)/Админ.
  const showClubTab = !!user && !isAdmin;
  const loadDecks = useDecksStore((s) => s.load);
  const appTheme = useAppThemeStore((s) => s.theme);
  const loadAppTheme = useAppThemeStore((s) => s.loadPublic);
  const loadAkTable = useAkTableStore((s) => s.loadPublic);
  const debugOverlayEnabled = useDebugOverlayStore((s) => s.enabled);
  const loadDebugOverlay = useDebugOverlayStore((s) => s.loadPublic);

  // Загружаем список колод, текущий визуальный скин, AK-стол и дебаг-оверлей тоггл один раз
  // при mount — appTheme решает, какой chrome рендерить ниже (PokerHubChrome/AkChrome), Card.tsx
  // использует колоды, akTableStore читается в GameRoom при заходе за стол.
  useEffect(() => {
    loadDecks();
    loadAppTheme();
    loadAkTable();
    loadDebugOverlay();
  }, [loadDecks, loadAppTheme, loadAkTable, loadDebugOverlay]);

  // Показ нижнего tab-bar только на mobile + только залогиненным + не на игровом столе/auth-страницах
  const path = location.pathname;
  const isGuestPage = path === '/login' || path === '/register';
  const isGameRoom = path.startsWith('/game/');
  const showBottomBar = !!user && !isGameRoom && !isGuestPage;

  // Свайп влево/вправо для переключения вкладок нижнего бара
  const tabRoutes = isAdmin
    ? ['/', '/lobby', '/club-admin', '/admin']
    : showClubTab
      ? ['/', '/lobby', '/club']
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

  // forceDisconnect — несколько причин: (а) открыли игру в другой вкладке (single-session) →
  // сообщение + редирект в лобби; (б) самоисключение/тайм-аут активированы прямо сейчас
  // (ROADMAP §11.2) → полный logout + редирект на /login, обычным реконнектом не вернуться,
  // т.к. дальнейший login заблокирован на сервере до истечения срока; (в) сессию отозвали
  // вручную в «Мои устройства» (§10.15) → тоже полный logout, токен этой сессии уже невалиден.
  useSocketEvent<{ reason?: string; until?: string }>(
    SOCKET_EVENTS.FORCE_DISCONNECT,
    (payload) => {
      if (payload?.reason === 'self-excluded' || payload?.reason === 'timeout') {
        const key = payload.reason === 'self-excluded' ? 'layout.selfExcludedDisconnected' : 'layout.timeoutDisconnected';
        toast.error(t(key, { until: payload.until }), { duration: 8000 });
        logout();
        navigate('/login');
        return;
      }
      if (payload?.reason === 'session-revoked') {
        toast.error(t('layout.sessionRevokedDisconnected'), { duration: 8000 });
        logout();
        navigate('/login');
        return;
      }
      toast.error(t('layout.tabDisconnected'), { duration: 5000 });
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
      toast.success(t('layout.seatFreed'));
      navigate('/game/' + roomId);
    },
    !!user,
  );

  // Результат турнира (выбыл/победил) — сервер шлёт это ДО закрытия стола, глобально (не только
  // в GameRoom), т.к. игрок может быть на любой странице в момент завершения (ROADMAP: раньше
  // стол молча пропадал и клиент узнавал об этом только через ошибку not-found).
  useSocketEvent<TournamentResultPayload>(
    SOCKET_EVENTS.TOURNAMENT_RESULT,
    (payload) => setTournamentResult(payload),
    !!user,
  );

  // Зайти заново прямо из модалки результата (как в PokerStars/GGPoker — предлагают ре-энтри
  // сразу при вылете). Переиспользует тот же register(), что и кнопка «Зайти заново» в лобби
  // турниров — сервер сам отличает ре-энтри от первого входа.
  const handleReEnter = async (tournamentId: string) => {
    setTournamentResult(null);
    if (!token) return;
    const result = await useTournamentStore.getState().register(token, tournamentId);
    if (!result.ok) {
      toast.error(result.error);
      navigate('/tournaments');
      return;
    }
    const trn = useTournamentStore.getState().tournaments.find((x) => x.id === tournamentId);
    const myTableId = trn?.entries.find((e) => e.userId === user?.id && e.status === 'playing')?.tableId;
    navigate(myTableId ? '/game/' + myTableId : '/tournaments');
  };

  // connect_error — сервер отклоняет handshake при невалидном/протухшем JWT ('No token'/'Invalid token'
  // из io.use; см. §11.42). Прочие ошибки (сеть, server down) игнорируем — не logout на каждый сбой связи.
  useSocketEvent<Error>(
    'connect_error',
    (err) => {
      if (err.message === 'Invalid token' || err.message === 'No token') {
        toast.error(t('layout.sessionExpired'), { duration: 5000 });
        logout();
        navigate('/login');
      }
    },
    !!user,
  );

  const isAk = appTheme === 'ak';

  return (
    <div className={'min-h-screen relative overflow-hidden ' + (isAk ? 'bg-ak-bg' : 'bg-gradient-to-br from-gray-950 via-gray-900 to-black')}>
      {/* Мультитейблинг: персистентный слушатель открытых столов (пилюли). Живёт выше роутов. */}
      <TablesManager />
      {debugOverlayEnabled && <DebugOverlay />}
      <TournamentResultModal
        result={tournamentResult}
        onClose={() => {
          setTournamentResult(null);
          navigate('/tournaments');
        }}
        onReEnter={handleReEnter}
      />
      {/* Фоновые блюр-пятна — дорогие по GPU (полноэкранный blur-3xl + animate-pulse), под неон-тему
          POKER HUB. За столом их не видно под непрозрачным полом (perf §0.10); под AK-скином тоже
          не рендерим — не вписываются в светлую fintech-композицию референса. */}
      {!isGameRoom && !isAk && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-poker-green/20 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-900/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2000ms' }} />
        </div>
      )}

      {/* Chrome переключается по appThemeStore (админ-тумблер «Визуальный скин приложения»,
          SettingsTab.tsx). Оба варианта — h-16 top/bottom бары, padding в <main> ниже общий. */}
      {isAk ? (
        <AkChrome
          t={t}
          path={path}
          user={user}
          isAdmin={isAdmin}
          showBottomBar={showBottomBar}
          isGameRoom={isGameRoom}
          navigate={navigate}
          logout={logout}
        />
      ) : (
        <PokerHubChrome
          t={t}
          path={path}
          user={user}
          isAdmin={isAdmin}
          showClubTab={showClubTab}
          showBottomBar={showBottomBar}
          isGameRoom={isGameRoom}
          inboxUnread={inboxUnread}
          navigate={navigate}
          logout={logout}
        />
      )}

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
    </div>
  );
};

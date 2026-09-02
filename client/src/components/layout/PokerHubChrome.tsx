import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Coins, Home, LayoutGrid, UserCircle, LogOut, Trophy, Crown, Shield } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';

// Локальный минимальный тип — authStore не экспортирует AuthUser, а тут нужны только эти поля.
interface ChromeUser {
  username: string;
  chips?: number;
}

// Кнопки в панели — lazy, код не в бандле обычного игрока.
const AdminNavButton = lazy(() => import('../admin/AdminNavButton'));
const ClubAdminNavButton = lazy(() => import('../admin/ClubAdminNavButton'));
const MyClubNavButton = lazy(() => import('../club/MyClubNavButton'));

// Текущий chrome POKER HUB (тёмный, неон-акценты) — вынесен из Layout.tsx как есть (без изменений
// разметки/логики), чтобы Layout мог переключать его на AkChrome по appThemeStore (§11 модульность).
// Пропы — то, что раньше было локальными переменными/хендлерами внутри Layout.
interface PokerHubChromeProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  path: string;
  user: ChromeUser | null;
  isAdmin: boolean;
  showClubTab: boolean;
  showBottomBar: boolean;
  isGameRoom: boolean;
  inboxUnread: number;
  navigate: (to: string) => void;
  logout: () => void;
}

export const PokerHubChrome = ({
  t,
  path,
  user,
  isAdmin,
  showClubTab,
  showBottomBar,
  isGameRoom,
  inboxUnread,
  navigate,
  logout,
}: PokerHubChromeProps) => {
  return (
    <>
      {/* На /game/ mobile вся Layout navbar скрыта — balance/admin/logout перенесены в GameRoom-бар */}
      <nav className={'fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/50 border-b border-white/10 ' + (isGameRoom ? 'hidden md:block' : '')}>
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xl md:text-2xl font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              onClick={() => navigate('/')}
              title={t('layout.home')}
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
                    title={t('layout.freeBankroll')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs md:text-sm font-bold whitespace-nowrap"
                  >
                    <Coins size={14} /> {formatMoney(user.chips)}
                  </span>
                )}
                {/* На мобиле admin-кнопки живут в нижнем баре (см. ниже); тут — только десктоп */}
                {showClubTab && (
                  <div className="hidden md:flex items-center gap-2 md:gap-3">
                    <Suspense fallback={null}>
                      <MyClubNavButton onClick={() => navigate('/club')} />
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

      {showBottomBar && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md bg-black/70 border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        >
          <div className={'grid h-16 ' + (isAdmin ? 'grid-cols-6' : showClubTab ? 'grid-cols-5' : 'grid-cols-4')}>
            <TabButton
              icon={<Home size={20} />}
              label={t('nav.home')}
              active={path === '/'}
              onClick={() => navigate('/')}
            />
            <TabButton
              icon={<LayoutGrid size={20} />}
              label={t('nav.lobby')}
              active={path === '/lobby'}
              onClick={() => navigate('/lobby')}
            />
            <TabButton
              icon={<Trophy size={20} />}
              label={t('nav.tournaments')}
              active={path === '/tournaments'}
              onClick={() => navigate('/tournaments')}
            />
            <TabButton
              icon={<UserCircle size={20} />}
              label={t('nav.profile')}
              active={path === '/profile'}
              onClick={() => navigate('/profile')}
              badge={inboxUnread || undefined}
            />
            {/* Кнопка «Клуб» — любой не-админ игрок; владелец/участник/без клуба — ветвление в ClubHome */}
            {showClubTab && (
              <TabButton
                icon={<Crown size={20} />}
                label={t('nav.club')}
                active={path.startsWith('/club') || path.startsWith('/my-club')}
                onClick={() => navigate('/club')}
              />
            )}
            {/* Admin-only: видны только админам (исходно были в верхней панели). */}
            {isAdmin && (
              <>
                <TabButton
                  icon={<Crown size={20} />}
                  label={t('nav.club')}
                  active={path.startsWith('/club-admin')}
                  onClick={() => navigate('/club-admin')}
                />
                <TabButton
                  icon={<Shield size={20} />}
                  label={t('nav.admin')}
                  active={path === '/admin'}
                  onClick={() => navigate('/admin')}
                />
              </>
            )}
          </div>
        </nav>
      )}
    </>
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

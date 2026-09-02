import { Suspense, lazy } from 'react';
import { Wallet, LayoutGrid, UserCircle, LogOut, Crown, Gift, Shield } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';

const AdminNavButton = lazy(() => import('../admin/AdminNavButton'));
const ClubAdminNavButton = lazy(() => import('../admin/ClubAdminNavButton'));

interface ChromeUser {
  username: string;
  chips?: number;
}

// AK-скин chrome (appTheme='ak') — светлый, IA по референсу: Лобби/Клуб/Кошелёк/Акция/Профиль.
// «Клуб»/«Акция» тут — новые визуальные AK-страницы (/ak-club, /ak-promotions), НЕ то же самое,
// что существующий /club (реальное управление клубом, вне скоупа AK-скина).
interface AkChromeProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  path: string;
  user: ChromeUser | null;
  isAdmin: boolean;
  showBottomBar: boolean;
  isGameRoom: boolean;
  navigate: (to: string) => void;
  logout: () => void;
}

const AK_TABS = [
  { to: '/lobby', label: 'Лобби', icon: LayoutGrid },
  { to: '/ak-club', label: 'Клуб', icon: Crown },
  { to: '/wallet', label: 'Кошелёк', icon: Wallet },
  { to: '/ak-promotions', label: 'Акция', icon: Gift },
  { to: '/profile', label: 'Профиль', icon: UserCircle },
] as const;

export const AkChrome = ({ t, path, user, isAdmin, showBottomBar, isGameRoom, navigate, logout }: AkChromeProps) => {
  return (
    <>
      <nav className={'ak-font fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-ak-navy/10 shadow-sm ' + (isGameRoom ? 'hidden md:block' : '')}>
        <div className="container mx-auto px-4 h-full flex justify-between items-center">
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/')}
              className="text-lg md:text-xl font-bold text-ak-navy whitespace-nowrap shrink-0"
              title={t('layout.home')}
            >
              AK
            </button>

            {user && (
              <div className="hidden md:flex items-center gap-1">
                {AK_TABS.map(({ to, label, icon: Icon }) => (
                  <button
                    key={to}
                    onClick={() => navigate(to)}
                    className={
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ' +
                      (path === to ? 'bg-ak-navy/10 text-ak-navy' : 'text-ak-text-muted hover:text-ak-navy hover:bg-ak-navy/5')
                    }
                  >
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {user ? (
              <>
                <span className="text-ak-text text-sm max-w-[110px] md:max-w-none truncate">{user.username}</span>
                {typeof user.chips === 'number' && (
                  <span
                    title={t('layout.freeBankroll')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-ak-teal/10 border border-ak-teal/30 text-ak-teal text-xs md:text-sm font-bold whitespace-nowrap"
                  >
                    $ {formatMoney(user.chips)}
                  </span>
                )}
                {isAdmin && (
                  <div className="hidden md:flex items-center gap-2 md:gap-3">
                    <Suspense fallback={null}>
                      <ClubAdminNavButton onClick={() => navigate('/club-admin')} />
                      <AdminNavButton onClick={() => navigate('/admin')} />
                    </Suspense>
                  </div>
                )}
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  title={t('nav.logout')}
                  className={
                    'flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-ak-red text-white text-sm ' +
                    (isGameRoom ? 'hidden md:flex' : '')
                  }
                >
                  <LogOut size={16} className="md:hidden" />
                  <span className="hidden md:inline">{t('nav.logout')}</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="px-3 md:px-4 py-1 border border-ak-navy text-ak-navy rounded-lg text-sm">
                  {t('nav.login')}
                </button>
                <button onClick={() => navigate('/register')} className="px-3 md:px-4 py-1 bg-ak-navy text-white rounded-lg text-sm font-bold whitespace-nowrap">
                  {t('nav.register')}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {showBottomBar && (
        <nav className="ak-font md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-ak-navy/10 shadow-[0_-2px_8px_rgba(4,28,100,0.06)] pb-[env(safe-area-inset-bottom)]">
          <div className={'grid h-16 ' + (isAdmin ? 'grid-cols-7' : 'grid-cols-5')}>
            {AK_TABS.map(({ to, label, icon: Icon }) => {
              const active = to === '/lobby' ? path === '/lobby' : path.startsWith(to);
              return (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-0 px-0.5"
                >
                  <div className={'flex items-center justify-center w-7 h-7 rounded-full transition-colors ' + (active ? 'bg-ak-navy text-white' : 'text-ak-text-muted')}>
                    <Icon size={16} />
                  </div>
                  <span className={'text-[10px] font-bold tracking-wide max-w-full truncate ' + (active ? 'text-ak-navy' : 'text-ak-text-muted')}>
                    {label}
                  </span>
                </button>
              );
            })}
            {isAdmin && (
              <>
                <button
                  onClick={() => navigate('/club-admin')}
                  className="relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-0 px-0.5"
                >
                  <div className={'flex items-center justify-center w-7 h-7 rounded-full ' + (path.startsWith('/club-admin') ? 'bg-ak-navy text-white' : 'text-ak-text-muted')}>
                    <Crown size={16} />
                  </div>
                  <span className={'text-[10px] font-bold ' + (path.startsWith('/club-admin') ? 'text-ak-navy' : 'text-ak-text-muted')}>Клуб-адм</span>
                </button>
                <button
                  onClick={() => navigate('/admin')}
                  className="relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-0 px-0.5"
                >
                  <div className={'flex items-center justify-center w-7 h-7 rounded-full ' + (path === '/admin' ? 'bg-ak-navy text-white' : 'text-ak-text-muted')}>
                    <Shield size={16} />
                  </div>
                  <span className={'text-[10px] font-bold ' + (path === '/admin' ? 'text-ak-navy' : 'text-ak-text-muted')}>Админ</span>
                </button>
              </>
            )}
          </div>
        </nav>
      )}
    </>
  );
};

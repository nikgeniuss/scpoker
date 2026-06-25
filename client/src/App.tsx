import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import { ScrollToTop } from './components/ScrollToTop';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequireAdmin } from './components/auth/RequireAdmin';
import { RequireClubOwner } from './components/auth/RequireClubOwner';
import { GuestOnly } from './components/auth/GuestOnly';
import { TelegramAutoLogin } from './components/auth/TelegramAutoLogin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainMenu } from './pages/MainMenu';
import { GameRoom } from './pages/GameRoom';
import { LobbyGate } from './pages/LobbyGate';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { Wallet } from './pages/Wallet';
import { AccountData } from './pages/AccountData';
import { Language } from './pages/Language';
import { Help } from './pages/Help';
import { PokerCraft } from './pages/PokerCraft';
import { Inbox } from './pages/Inbox';
import { Leaderboard } from './pages/Leaderboard';
import { DeckPreview } from './pages/DeckPreview';
import { SeatingPreview } from './pages/SeatingPreview';
import { RedesignPreview } from './pages/RedesignPreview';
import { Tournaments } from './pages/Tournaments';
import { RakebackInfo } from './pages/RakebackInfo';

// Админка — отдельный lazy-чанк: код админ-панели (управление юзерами/комнатами/ботами/настройками)
// НЕ попадает в основной бандл игрока. Загружается только когда админ заходит на /admin (за RequireAdmin).
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const ClubAdmin = lazy(() => import('./pages/ClubAdmin').then((m) => ({ default: m.ClubAdmin })));
const BadBeatAdmin = lazy(() => import('./pages/BadBeatAdmin').then((m) => ({ default: m.BadBeatAdmin })));
const BadBeatTriggers = lazy(() => import('./pages/BadBeatTriggers').then((m) => ({ default: m.BadBeatTriggers })));
const ClubLeaderboard = lazy(() => import('./pages/ClubLeaderboard').then((m) => ({ default: m.ClubLeaderboard })));
const BadBeatTopUp = lazy(() => import('./pages/BadBeatTopUp').then((m) => ({ default: m.BadBeatTopUp })));
const BadBeatTopUpHistory = lazy(() => import('./pages/BadBeatTopUpHistory').then((m) => ({ default: m.BadBeatTopUpHistory })));
const BadBeatInfo = lazy(() => import('./pages/BadBeatInfo').then((m) => ({ default: m.BadBeatInfo })));
const MyClubAdmin = lazy(() => import('./pages/myClub/MyClubAdmin').then((m) => ({ default: m.MyClubAdmin })));

function App() {
  return (
    <Router>
      <ScrollToTop />
      <TelegramAutoLogin />
      <Layout>
        <Routes>
          <Route path="/" element={<ErrorBoundary><MainMenu /></ErrorBoundary>} />
          <Route path="/lobby" element={<ErrorBoundary><RequireAuth><LobbyGate /></RequireAuth></ErrorBoundary>} />
          <Route path="/tournaments" element={<ErrorBoundary><RequireAuth><Tournaments /></RequireAuth></ErrorBoundary>} />
          <Route path="/game/:roomId" element={<ErrorBoundary><RequireAuth><GameRoom /></RequireAuth></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><RequireAuth><Profile /></RequireAuth></ErrorBoundary>} />
          <Route path="/account" element={<ErrorBoundary><RequireAuth><AccountData /></RequireAuth></ErrorBoundary>} />
          <Route path="/wallet" element={<ErrorBoundary><RequireAuth><Wallet /></RequireAuth></ErrorBoundary>} />
          <Route path="/language" element={<ErrorBoundary><RequireAuth><Language /></RequireAuth></ErrorBoundary>} />
          <Route path="/help" element={<ErrorBoundary><RequireAuth><Help /></RequireAuth></ErrorBoundary>} />
          <Route path="/pokercraft" element={<ErrorBoundary><RequireAuth><PokerCraft /></RequireAuth></ErrorBoundary>} />
          <Route path="/inbox" element={<ErrorBoundary><RequireAuth><Inbox /></RequireAuth></ErrorBoundary>} />
          <Route path="/leaderboard" element={<ErrorBoundary><RequireAuth><Leaderboard /></RequireAuth></ErrorBoundary>} />
          <Route path="/rakeback" element={<ErrorBoundary><RequireAuth><RakebackInfo /></RequireAuth></ErrorBoundary>} />
          <Route path="/deck-preview" element={<ErrorBoundary><DeckPreview /></ErrorBoundary>} />
          <Route path="/seating-preview" element={<ErrorBoundary><SeatingPreview /></ErrorBoundary>} />
          <Route path="/redesign-preview" element={<ErrorBoundary><RedesignPreview /></ErrorBoundary>} />
          <Route
            path="/bad-beat"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <BadBeatInfo />
                  </Suspense>
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/my-club"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <RequireClubOwner>
                    <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                      <MyClubAdmin />
                    </Suspense>
                  </RequireClubOwner>
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route path="/register" element={<ErrorBoundary><GuestOnly><Register /></GuestOnly></ErrorBoundary>} />
          <Route path="/login" element={<ErrorBoundary><GuestOnly><Login /></GuestOnly></ErrorBoundary>} />
          <Route
            path="/admin"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-gray-900 flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <Admin />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <ClubAdmin />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin/bad-beat"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <BadBeatAdmin />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin/bad-beat/triggers"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <BadBeatTriggers />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin/bad-beat/topup"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <BadBeatTopUp />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin/bad-beat/topup-history"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <BadBeatTopUpHistory />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
          <Route
            path="/club-admin/leaderboard"
            element={
              <ErrorBoundary>
                <RequireAdmin>
                  <Suspense fallback={<div className="min-h-[100dvh] bg-black flex items-center justify-center text-gray-400">Загрузка…</div>}>
                    <ClubLeaderboard />
                  </Suspense>
                </RequireAdmin>
              </ErrorBoundary>
            }
          />
        </Routes>
      </Layout>

      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#fff',
            border: '1px solid #374151',
          },
        }}
      />
    </Router>
  );
}

export default App;
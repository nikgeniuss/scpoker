import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/auth/RequireAuth';
import { GuestOnly } from './components/auth/GuestOnly';
import { TelegramAutoLogin } from './components/auth/TelegramAutoLogin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainMenu } from './pages/MainMenu';
import { GameRoom } from './pages/GameRoom';
import { Lobby } from './pages/Lobby';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { Admin } from './pages/Admin';

function App() {
  return (
    <Router>
      <TelegramAutoLogin />
      <Layout>
        <Routes>
          <Route path="/" element={<ErrorBoundary><MainMenu /></ErrorBoundary>} />
          <Route path="/lobby" element={<ErrorBoundary><RequireAuth><Lobby /></RequireAuth></ErrorBoundary>} />
          <Route path="/game/:roomId" element={<ErrorBoundary><RequireAuth><GameRoom /></RequireAuth></ErrorBoundary>} />
          <Route path="/register" element={<ErrorBoundary><GuestOnly><Register /></GuestOnly></ErrorBoundary>} />
          <Route path="/login" element={<ErrorBoundary><GuestOnly><Login /></GuestOnly></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><Admin /></ErrorBoundary>} />
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
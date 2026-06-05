import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import { getTelegramInitData } from '../../lib/telegram';

// Внутри Telegram Mini App автоматически логинит юзера через initData → JWT.
// Если уже есть token в localStorage — ничего не делает.
// Если initData пуст или сервер вернул ошибку — тоже ничего не делает (юзер увидит обычный MainMenu и сможет войти руками).
// Mounted один раз в App.tsx; срабатывает один раз за загрузку страницы.
export function TelegramAutoLogin() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    if (token) return; // уже залогинен — ничего не делаем

    const initData = getTelegramInitData();
    if (!initData) return; // не TG или нет initData

    triedRef.current = true;

    (async () => {
      try {
        const res = await fetch(API_URL + '/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) {
          // 503 → сервер без BOT_TOKEN; 401 → подпись плохая; 403 → бан. Молча падаем в обычный flow.
          const data = await res.json().catch(() => ({}));
          console.warn('Telegram auto-login failed:', res.status, data);
          return;
        }
        const data = await res.json();
        login(data.token, data.user);
        toast.success('Вход через Telegram');
        // Если юзер на /login или /register — после auto-login сразу в лобби.
        if (location.pathname === '/login' || location.pathname === '/register') {
          navigate('/lobby', { replace: true });
        }
      } catch (err) {
        console.warn('Telegram auto-login error:', err);
      }
    })();
  }, [token, login, navigate, location.pathname]);

  return null;
}

import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import { getTelegramInitData, getTelegramStartParam } from '../../lib/telegram';
import { getDeviceId } from '../../lib/deviceId';

// Внутри Telegram Mini App автоматически логинит юзера через initData → JWT.
// Если уже есть token в localStorage — ничего не делает.
// Если initData пуст или сервер вернул ошибку — тоже ничего не делает (юзер увидит обычный MainMenu и сможет войти руками).
// Mounted один раз в App.tsx; срабатывает один раз за загрузку страницы.
export function TelegramAutoLogin() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    // Уже залогинены в этой сессии Mini App — ни автологин, ни повторную привязку не запускаем.
    // Раньше проверка token стояла только у автологина ниже, а ветка startParam срабатывала
    // безусловно — из-за этого повторное открытие Mini App с «залипшим» start_param (например,
    // у постоянной кнопки «Старт» бота) на каждый заход заново дёргало /auth/link/confirm и
    // перезаписывало токен, из-за чего рвался текущий сокет (single-session guard, §0.6) —
    // выглядело как сброс сессии по кнопке «Старт».
    if (token) return;

    const initData = getTelegramInitData();
    if (!initData) return; // не TG или нет initData

    const startParam = getTelegramStartParam();

    // Привязка существующего аккаунта (открыт deep-link ?startapp=<code>) — приоритетнее автологина.
    if (startParam) {
      triedRef.current = true;
      (async () => {
        try {
          const res = await fetch(API_URL + '/auth/link/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
            body: JSON.stringify({ initData, code: startParam }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(data.error || t('telegramAutoLogin.linkFailed'));
            return;
          }
          login(data.token, data.user);
          toast.success(t('telegramAutoLogin.linked'));
          navigate('/lobby', { replace: true });
        } catch {
          toast.error(t('telegramAutoLogin.linkError'));
        }
      })();
      return;
    }

    // Обычный автологин по initData (token уже проверен выше — сюда доходим, только если пусто).
    triedRef.current = true;
    (async () => {
      try {
        const res = await fetch(API_URL + '/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
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
        toast.success(t('telegramAutoLogin.loggedIn'));
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

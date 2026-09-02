import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import type { GameManager } from '../game/GameManager.js';
import {
  registerUser,
  loginUser,
  validateTelegramInitData,
  loginOrRegisterTelegramUser,
  createTelegramLinkCode,
  linkTelegramToAccount,
  setAvatarSeed,
  updateUsername,
  updateEmail,
  setupTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  completeTwoFactorLogin,
  type DeviceInfo,
} from '../auth/auth.js';
import { listSessions, revokeSession } from '../auth/sessionStore.js';
import { AVATAR_PRESETS } from '@poker-room/shared';
import { TELEGRAM_BOT_TOKEN, JWT_SECRET } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { readJSON } from '../auth/storage.js';

// Лимиты на перебор пароля/2FA-кода (CWE-307) — по IP, см. rateLimit.ts.
const loginLimiter = rateLimit('login', 10, 5 * 60_000);
const twoFaLimiter = rateLimit('2fa', 10, 5 * 60_000);
const registerLimiter = rateLimit('register', 20, 10 * 60_000);

// Device info логина («Мои устройства», §10.15; deviceId — анти-фарм визит-бонуса §10.21.2) —
// из заголовков запроса, без доп. библиотек. x-device-id — тот же localStorage UUID, что клиент
// уже шлёт на сокет для anti-collusion за столом (client/src/lib/deviceId.ts), сюда — заголовком.
function deviceInfoFrom(req: Request): DeviceInfo {
  const deviceIdHeader = req.headers['x-device-id'];
  return {
    userAgent: req.headers['user-agent'] ?? '',
    ip: req.ip ?? '',
    deviceId: typeof deviceIdHeader === 'string' ? deviceIdHeader : '',
  };
}

// Роуты авторизации (/api/auth/*). Вынесено из index.ts (ROADMAP §9.3-C).
export function createAuthRouter(gameManager: GameManager): Router {
  const router = Router();

  router.post('/register', registerLimiter, (req, res) => {
    const { username, password, email, tosAccepted, dateOfBirth, refCode } = req.body;

    // Проверяем, что все поля пришли
    if (!username || !password || !email || !dateOfBirth) {
      res.status(400).json({ error: 'Username, email, password and date of birth required' });
      return;
    }
    if (!tosAccepted) {
      res.status(400).json({ error: 'Необходимо согласие с условиями использования' });
      return;
    }

    // Передаём email и дату рождения в registerUser (возраст 18+ проверяется там); refCode —
    // реферальная привязка (§10.21.5), опциональна, невалидный код молча игнорируется.
    const result = registerUser(
      username,
      password,
      email,
      dateOfBirth,
      deviceInfoFrom(req),
      typeof refCode === 'string' ? refCode : undefined,
    );

    if ('error' in result) {
      const messages: Record<typeof result.error, string> = {
        'username-taken': 'Username or email already exists',
        'email-taken': 'Username or email already exists',
        'invalid-dob': 'Некорректная дата рождения',
        underage: 'Регистрация доступна только для лиц старше 18 лет',
      };
      const status = result.error === 'underage' ? 403 : result.error === 'invalid-dob' ? 400 : 409;
      res.status(status).json({ error: messages[result.error] });
      return;
    }
    const user = result.user;

    const loginResult = loginUser(username, password, deviceInfoFrom(req));
    const token = 'token' in loginResult ? loginResult.token : null;

    // Возвращаем email в ответе
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  });

  router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
    const result = loginUser(username, password, deviceInfoFrom(req));
    if ('twoFactorRequired' in result) {
      res.json({ twoFactorRequired: true, pendingToken: result.pendingToken });
      return;
    }
    if ('error' in result) {
      if (result.error === 'self-excluded') {
        res.status(403).json({ error: `Вы включили самоисключение до ${result.until}`, until: result.until });
        return;
      }
      if (result.error === 'timeout') {
        res.status(403).json({ error: `Вы включили тайм-аут до ${result.until}`, until: result.until });
        return;
      }
      const status = result.error === 'banned' ? 403 : 401;
      const error = result.error === 'banned' ? 'Аккаунт заблокирован' : 'Invalid credentials';
      res.status(status).json({ error });
      return;
    }
    const token = result.token;
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    res.json({ token, user: { id: decoded.id, username: decoded.username, role: decoded.role } });
  });

  // Шаг 2 логина при включённой 2FA: pendingToken из /login + код из приложения-аутентификатора (или backup-код).
  router.post('/login/2fa', twoFaLimiter, (req, res) => {
    const { pendingToken, code } = req.body as { pendingToken?: string; code?: string };
    if (typeof pendingToken !== 'string' || typeof code !== 'string') {
      res.status(400).json({ error: 'pendingToken и code обязательны' });
      return;
    }
    const result = completeTwoFactorLogin(pendingToken, code, deviceInfoFrom(req));
    if ('error' in result) {
      const status = result.error === 'invalid-token' ? 401 : 400;
      const error = result.error === 'invalid-token' ? 'Сессия входа истекла, войдите заново' : 'Неверный код';
      res.status(status).json({ error });
      return;
    }
    const token = result.token;
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    res.json({ token, user: { id: decoded.id, username: decoded.username, role: decoded.role } });
  });

  // Авторизация через Telegram Mini App initData.
  // Принимает { initData: string } из window.Telegram.WebApp.initData, валидирует HMAC по
  // официальному алгоритму (см. validateTelegramInitData), создаёт/находит юзера по telegramId.
  router.post('/telegram', (req, res) => {
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(503).json({ error: 'Telegram auth не сконфигурирован на сервере' });
      return;
    }
    const { initData } = req.body as { initData?: string };
    if (!initData || typeof initData !== 'string') {
      res.status(400).json({ error: 'initData обязателен' });
      return;
    }
    const tgUser = validateTelegramInitData(initData, TELEGRAM_BOT_TOKEN);
    if (!tgUser) {
      res.status(401).json({ error: 'Невалидная подпись initData' });
      return;
    }
    const result = loginOrRegisterTelegramUser(tgUser, deviceInfoFrom(req));
    if (!result) {
      res.status(403).json({ error: 'Аккаунт заблокирован' });
      return;
    }
    const { token, user } = result;
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        chips: user.chips,
        publicId: user.publicId,
        country: user.country,
      },
    });
  });

  // Привязка Telegram — шаг 1: залогиненный (browser) юзер запрашивает одноразовый код.
  // Клиент откроет t.me/<bot>/<app>?startapp=<code>, Mini App подтвердит на /link/confirm.
  router.post('/link/start', authMiddleware, (req, res) => {
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(503).json({ error: 'Telegram не сконфигурирован на сервере' });
      return;
    }
    const jwtUser = (req as unknown as { user: { id: string } }).user;
    const code = createTelegramLinkCode(jwtUser.id);
    res.json({ code });
  });

  // Привязка Telegram — шаг 2: Mini App присылает initData + code. Привязываем TG к аккаунту из
  // кода, сливаем баланс TG-дубля (если был). Возвращаем токен объединённого аккаунта.
  router.post('/link/confirm', (req, res) => {
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(503).json({ error: 'Telegram не сконфигурирован на сервере' });
      return;
    }
    const { initData, code } = req.body as { initData?: string; code?: string };
    if (!initData || typeof initData !== 'string' || !code || typeof code !== 'string') {
      res.status(400).json({ error: 'initData и code обязательны' });
      return;
    }
    const tgUser = validateTelegramInitData(initData, TELEGRAM_BOT_TOKEN);
    if (!tgUser) {
      res.status(401).json({ error: 'Невалидная подпись initData' });
      return;
    }
    const result = linkTelegramToAccount(code, tgUser, deviceInfoFrom(req));
    if ('error' in result) {
      if (result.error === 'self-excluded' || result.error === 'timeout') {
        const label = result.error === 'self-excluded' ? 'самоисключение' : 'тайм-аут';
        res.status(403).json({ error: `Включён ${label} до ${result.until}`, until: result.until });
        return;
      }
      const map = {
        code: [400, 'Код привязки недействителен или истёк'],
        banned: [403, 'Аккаунт заблокирован'],
        conflict: [409, 'К этому аккаунту уже привязан другой Telegram'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    const { token, user } = result;
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        chips: user.chips,
        publicId: user.publicId,
        country: user.country,
      },
    });
  });

  router.get('/me', authMiddleware, (req, res) => {
    const jwtUser = (req as unknown as { user: { id: string; username: string; role: string } }).user;
    // Догружаем актуальные данные из users.json — клиенту нужен банкролл для BuyInModal,
    // email/createdAt/telegramId — для страницы «Данные аккаунта» (профиль)
    let chips = 0;
    let publicId: string | undefined;
    let country: string | undefined;
    let avatarSeed: string | undefined;
    let email: string | undefined;
    let createdAt: string | undefined;
    let telegramId: number | undefined;
    let twoFactorEnabled = false;
    let dateOfBirth: string | undefined;
    try {
      const users = readJSON('users.json') as Array<{ id: string; chips: number; publicId?: string; country?: string; avatarSeed?: string; email?: string; createdAt?: string; telegramId?: number; twoFactorEnabled?: boolean; dateOfBirth?: string }>;
      const u = users.find(x => x.id === jwtUser.id);
      if (u) {
        chips = u.chips;
        publicId = u.publicId;
        country = u.country;
        avatarSeed = u.avatarSeed;
        email = u.email;
        createdAt = u.createdAt;
        telegramId = u.telegramId;
        twoFactorEnabled = !!u.twoFactorEnabled;
        dateOfBirth = u.dateOfBirth;
      }
    } catch {
      // users.json временно недоступен (race с writeJSON-дебаунсом) — отдаём jwtUser без догрузки
    }
    res.json({ user: { ...jwtUser, chips, publicId, country, avatarSeed, email, createdAt, telegramId, twoFactorEnabled, dateOfBirth } });
  });

  // Подключение 2FA — шаг 1: новый секрет (pending, не активен до /2fa/confirm).
  router.post('/2fa/setup', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const result = setupTwoFactor(userId);
    if ('error' in result) {
      const map = {
        'not-found': [404, 'Пользователь не найден'],
        'already-enabled': [409, '2FA уже включена'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    res.json({ secret: result.secret });
  });

  // Подключение 2FA — шаг 2: код из приложения подтверждает pending-секрет, выдаём backup-коды.
  router.post('/2fa/confirm', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { code } = req.body as { code?: string };
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'code обязателен' });
      return;
    }
    const result = confirmTwoFactor(userId, code);
    if ('error' in result) {
      const map = {
        'not-found': [404, 'Пользователь не найден'],
        'no-pending': [400, 'Сначала запросите подключение 2FA'],
        'invalid-code': [400, 'Неверный код'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    res.json({ backupCodes: result.backupCodes });
  });

  // Отключение 2FA самим игроком — требует текущий TOTP-код или backup-код.
  router.post('/2fa/disable', authMiddleware, twoFaLimiter, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { code } = req.body as { code?: string };
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'code обязателен' });
      return;
    }
    const result = disableTwoFactor(userId, code);
    if ('error' in result) {
      const map = {
        'not-found': [404, 'Пользователь не найден'],
        'not-enabled': [400, '2FA не включена'],
        'invalid-code': [400, 'Неверный код'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    res.json({ success: true });
  });

  // Смена имени пользователя (профиль → «Данные аккаунта»). Перевыпускаем JWT — username
  // зашит в токен и используется напрямую при socket-авторизации (имя за столом).
  router.put('/username', authMiddleware, (req, res) => {
    const jwtUser = (req as unknown as { user: { id: string; sid?: string } }).user;
    const { username } = req.body as { username?: string };
    if (typeof username !== 'string') {
      res.status(400).json({ error: 'username обязателен' });
      return;
    }
    const result = updateUsername(jwtUser.id, username);
    if ('error' in result) {
      const map = {
        invalid: [400, 'Имя пользователя должно быть от 3 до 32 символов'],
        taken: [409, 'Это имя пользователя уже занято'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    const { user } = result;
    // sid сохраняем как был — это переподпись токена той же сессии, не новый логин.
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sid: jwtUser.sid }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  // Список устройств/сессий текущего юзера («Мои устройства», §10.15) — новые сверху, помечает текущую.
  router.get('/sessions', authMiddleware, (req, res) => {
    const jwtUser = (req as unknown as { user: { id: string; sid?: string } }).user;
    const sessions = listSessions(jwtUser.id).map((s) => ({ ...s, current: s.sid === jwtUser.sid }));
    res.json({ sessions });
  });

  // Отозвать конкретную сессию — удаляет запись и, если есть live-сокет с этим sid, рвёт его немедленно.
  router.post('/sessions/:sid/revoke', authMiddleware, (req, res) => {
    const jwtUser = (req as unknown as { user: { id: string } }).user;
    const sid = String(req.params.sid);
    const ok = revokeSession(jwtUser.id, sid);
    if (!ok) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }
    gameManager.revokeUserSession(sid);
    res.json({ success: true });
  });

  // Смена email (профиль → «Данные аккаунта»).
  router.put('/email', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { email } = req.body as { email?: string };
    if (typeof email !== 'string') {
      res.status(400).json({ error: 'email обязателен' });
      return;
    }
    const result = updateEmail(userId, email);
    if ('error' in result) {
      const map = {
        invalid: [400, 'Некорректный email'],
        taken: [409, 'Этот email уже используется'],
      } as const;
      const [status, error] = map[result.error];
      res.status(status).json({ error });
      return;
    }
    res.json({ email: result.user.email });
  });

  // Выбор аватара из фиксированного списка (профиль → карусель). Любой авторизованный.
  router.put('/avatar', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const seed = req.body?.seed;
    if (typeof seed !== 'string' || !AVATAR_PRESETS.includes(seed)) {
      res.status(400).json({ error: 'seed: один из AVATAR_PRESETS' });
      return;
    }
    const ok = setAvatarSeed(userId, seed);
    if (!ok) { res.status(404).json({ error: 'Пользователь не найден' }); return; }
    res.json({ avatarSeed: seed });
  });

  return router;
}

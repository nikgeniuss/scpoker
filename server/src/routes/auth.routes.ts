import { Router } from 'express';
import {
  registerUser,
  loginUser,
  validateTelegramInitData,
  loginOrRegisterTelegramUser,
  createTelegramLinkCode,
  linkTelegramToAccount,
  setAvatarSeed,
} from '../auth/auth.js';
import { AVATAR_PRESETS } from '@poker-room/shared';
import { TELEGRAM_BOT_TOKEN } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { readJSON } from '../auth/storage.js';

// Роуты авторизации (/api/auth/*). Вынесено из index.ts (ROADMAP §9.3-C).
export function createAuthRouter(): Router {
  const router = Router();

  router.post('/register', (req, res) => {
    const { username, password, email } = req.body;

    // Проверяем, что все три поля пришли
    if (!username || !password || !email) {
      res.status(400).json({ error: 'Username, email and password required' });
      return;
    }

    // Передаём email в registerUser
    const user = registerUser(username, password, email);

    if (!user) {
      // Ошибка может быть и из-за email тоже
      res.status(409).json({ error: 'Username or email already exists' });
      return;
    }

    const token = loginUser(username, password);

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

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
    const token = loginUser(username, password);
    if (!token) { res.status(401).json({ error: 'Invalid credentials' }); return; }
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
    const result = loginOrRegisterTelegramUser(tgUser);
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
    const result = linkTelegramToAccount(code, tgUser);
    if ('error' in result) {
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
    // Догружаем актуальные chips/publicId/country/avatarSeed из users.json — клиенту нужен банкролл для BuyInModal
    let chips = 0;
    let publicId: string | undefined;
    let country: string | undefined;
    let avatarSeed: string | undefined;
    try {
      const users = readJSON('users.json') as Array<{ id: string; chips: number; publicId?: string; country?: string; avatarSeed?: string }>;
      const u = users.find(x => x.id === jwtUser.id);
      if (u) {
        chips = u.chips;
        publicId = u.publicId;
        country = u.country;
        avatarSeed = u.avatarSeed;
      }
    } catch {
      // users.json временно недоступен (race с writeJSON-дебаунсом) — отдаём jwtUser без догрузки
    }
    res.json({ user: { ...jwtUser, chips, publicId, country, avatarSeed } });
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

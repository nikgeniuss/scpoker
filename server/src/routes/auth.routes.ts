import { Router } from 'express';
import {
  registerUser,
  loginUser,
  validateTelegramInitData,
  loginOrRegisterTelegramUser,
} from '../auth/auth.js';
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
        role: user.role,
        chips: user.chips,
        publicId: user.publicId,
        country: user.country,
      },
    });
  });

  router.get('/me', authMiddleware, (req, res) => {
    const jwtUser = (req as any).user;
    // Догружаем актуальные chips/publicId/country из users.json — клиенту нужен банкролл для BuyInModal
    let chips = 0;
    let publicId: string | undefined;
    let country: string | undefined;
    try {
      const users = readJSON('users.json') as Array<{ id: string; chips: number; publicId?: string; country?: string }>;
      const u = users.find(x => x.id === jwtUser.id);
      if (u) {
        chips = u.chips;
        publicId = u.publicId;
        country = u.country;
      }
    } catch {}
    res.json({ user: { ...jwtUser, chips, publicId, country } });
  });

  return router;
}

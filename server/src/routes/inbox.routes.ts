import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getNotifications, getUnreadCount, markAllRead } from '../game/inboxService.js';

// Входящие уведомления игрока (§10.13). Любой авторизованный.
export function createInboxRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json({
      notifications: getNotifications(userId),
      unread: getUnreadCount(userId),
    });
  });

  router.post('/read-all', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    markAllRead(userId);
    res.json({ ok: true });
  });

  return router;
}

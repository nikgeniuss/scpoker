import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getHandsForUser } from '../game/handHistory.js';
import { getChartData } from '../game/statsService.js';

// История раздач текущего юзера (/api/hands). Любой авторизованный.
// Приватность карт (§0.1) применяется в getHandsForUser — чужие карманные только при showdown.
export function createHandsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const raw = Number((req.query.limit as string) ?? 50);
    const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? raw : 50));
    res.json(getHandsForUser(userId, limit));
  });

  // Кумулятивный PnL для графика банкролла (PokerCraft-lite §10.10).
  router.get('/chart', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getChartData(userId));
  });

  return router;
}

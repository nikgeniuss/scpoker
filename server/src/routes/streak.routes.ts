import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getStreakConfig } from '../game/streakService.js';
import { getUserStreakInfo } from '../auth/auth.js';

// Визит-бонус/стрик (/api/streak, ROADMAP §10.21.2). «/» — публичная таблица наград (без auth,
// как /api/rakeback), «/me» — личный кабинет текущего игрока (серия/сегодня/текущая награда).
export function createStreakRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getStreakConfig());
  });

  router.get('/me', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserStreakInfo(userId));
  });

  return router;
}

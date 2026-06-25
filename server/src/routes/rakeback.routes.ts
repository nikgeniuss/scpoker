import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getRakebackPublic, getUserRakebackInfo } from '../game/rakebackService.js';

// Рейкбэк (/api/rakeback). «/» — публичная таблица уровней (без auth, как /api/badbeat),
// «/me» — личный кабинет текущего игрока (lifetime-рейк, уровень, история начислений).
export function createRakebackRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getRakebackPublic());
  });

  router.get('/me', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserRakebackInfo(userId));
  });

  return router;
}

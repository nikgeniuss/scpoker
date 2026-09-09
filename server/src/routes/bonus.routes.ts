import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserBonusState, claim } from '../game/depositBonusService.js';
import { rateLimit } from '../middleware/rateLimit.js';

// Депозитный бонус (/api/bonus, §10.21.9). «/me» — прогресс отыгрыша и доступная к получению
// сумма, «/claim» — забрать открытое. Публичной части нет: бонус всегда персональный.
// Флуд денежных эндпоинтов не даёт двойных начислений (все claim-пути синхронны), но грузит
// диск и рассылки — лимит по IP (аудит 2026-09-08).
const rewardsLimiter = rateLimit('rewards', 30, 60_000);

export function createBonusRouter(): Router {
  const router = Router();

  router.get('/me', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserBonusState(userId));
  });

  router.post('/claim', authMiddleware, rewardsLimiter, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const result = claim(userId);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, state: getUserBonusState(userId) });
  });

  return router;
}

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserWalletInfo } from '../game/rewardsWalletService.js';

// Баланс HUB-коинов (/api/rewards-wallet, ROADMAP §10.21.6) — единая точка, где видно ОБЩИЙ
// баланс, собранный из всех источников (рейкбэк/стрик/достижения/гонки/рефералка). НЕ путать
// с /api/payments (реальный крипто-кошелёк, выводимый в USDT) — разные валюты, разные роуты.
export function createRewardsWalletRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserWalletInfo(userId));
  });

  return router;
}

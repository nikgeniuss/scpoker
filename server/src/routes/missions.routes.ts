import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserMissions, claimMission } from '../game/missionsService.js';
import { credit as creditRewardsWallet } from '../game/rewardsWalletService.js';
import { sendNotification } from '../game/inboxService.js';
import { rateLimit } from '../middleware/rateLimit.js';

// Недельные миссии (/api/missions, ROADMAP §10.21.3). Тот же контракт, что у достижений:
// прогресс и право на награду решает сервер (§0.13), клиент только показывает и жмёт «забрать».
// Флуд денежных эндпоинтов не даёт двойных начислений (все claim-пути синхронны), но грузит
// диск и рассылки — лимит по IP (аудит 2026-09-08).
const rewardsLimiter = rateLimit('rewards', 30, 60_000);

export function createMissionsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserMissions(userId));
  });

  router.post('/claim', rewardsLimiter, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { id } = req.body as { id?: string };
    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'invalid-id' });
      return;
    }
    const result = claimMission(userId, id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    creditRewardsWallet(userId, result.reward, 'mission', id);
    sendNotification(
      userId,
      'reward',
      `Миссия недели выполнена: ${result.chestTitle ? result.chestTitle + ' — ' : ''}+${result.reward} HUB`,
    );
    res.json({ reward: result.reward, chestTitle: result.chestTitle });
  });

  return router;
}

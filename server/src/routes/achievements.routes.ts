import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { aggregateUserStats } from '../game/statsService.js';
import { getUserRakebackInfo } from '../game/rakebackService.js';
import { credit as creditRewardsWallet } from '../game/rewardsWalletService.js';
import { sendNotification } from '../game/inboxService.js';
import { getUserTotals } from '../game/tournament/tournamentPlayerTotals.js';
import {
  getAchievementsCatalog,
  computeAchievements,
  claimAchievement,
  getClaimedIds,
  type AchievementProgress,
} from '../game/achievementsService.js';

// Достижения (/api/achievements, ROADMAP §10.21.3). Прогресс — compute-on-read из уже
// существующих источников: statsService (руки), rakebackService (рейк), tournamentPlayerTotals
// (турниры). Турнирное ядро НЕ трогаем ни единой строкой.
// Турниры считаем по накопленным итогам, а НЕ по tournamentManager.list(): завершённый турнир
// удаляется из списка через 30 минут, и прогресс откатывался — игрок видел «2/10», через полчаса
// снова «0/10», а незабранную награду мог не успеть забрать (claimAchievement пересчитывает
// прогресс на клейме). Найдено 2026-09-06.
function buildProgress(userId: string): AchievementProgress {
  const stats = aggregateUserStats(userId, null, null); // lifetime
  const rb = getUserRakebackInfo(userId);
  const t = getUserTotals(userId);
  return {
    hands: stats.hands,
    tournamentsPlayed: t.tournaments,
    tournamentWins: t.wins,
    lifetimeRake: rb.lifetimeRake,
  };
}

export function createAchievementsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { enabled, catalog } = getAchievementsCatalog();
    if (!enabled) {
      res.json({ enabled: false, achievements: [] });
      return;
    }
    const progress = buildProgress(userId);
    const achievements = computeAchievements(catalog, getClaimedIds(userId), progress);
    res.json({ enabled: true, achievements });
  });

  router.post('/claim', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { id } = req.body as { id?: string };
    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'invalid-id' });
      return;
    }
    const progress = buildProgress(userId);
    const result = claimAchievement(userId, id, progress);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    creditRewardsWallet(userId, result.reward, 'mission', id);
    sendNotification(
      userId,
      'reward',
      `Достижение забрано: ${result.chestTitle ? result.chestTitle + ' — ' : ''}+${result.reward} HUB`,
    );
    res.json({ reward: result.reward, chestTitle: result.chestTitle });
  });

  return router;
}

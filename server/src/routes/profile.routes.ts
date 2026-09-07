import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { aggregateUserStats } from '../game/statsService.js';
import { getUserTotals, toRoi } from '../game/tournament/tournamentPlayerTotals.js';
import { getMinutes } from '../game/tableTimeService.js';

// Блок статистики в профиле (/api/profile/stats, ROADMAP §9.1): lifetime-итоги раздач
// (statsService), турнирный ROI (копится при finish — завершённый турнир через 30 минут уходит
// из списка, считать по нему было бы нечего) и минуты за столом (tableTimeService).
export function createProfileRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/stats', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const stats = aggregateUserStats(userId, null, null); // lifetime, обрезка hands.json не влияет
    const roi = toRoi(getUserTotals(userId));
    res.json({
      hands: stats.hands,
      wins: stats.wins,
      roiPercent: roi.roiPercent,
      tableMinutes: getMinutes(userId),
    });
  });

  return router;
}

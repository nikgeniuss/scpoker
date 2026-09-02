import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';
import { aggregateUserStats } from '../game/statsService.js';
import { getUserRakebackInfo } from '../game/rakebackService.js';
import { credit as creditRewardsWallet } from '../game/rewardsWalletService.js';
import { sendNotification } from '../game/inboxService.js';
import {
  getAchievementsCatalog,
  computeAchievements,
  computeTournamentStats,
  claimAchievement,
  getClaimedIds,
  type AchievementProgress,
} from '../game/achievementsService.js';

// Достижения (/api/achievements, ROADMAP §10.21.3). Прогресс — compute-on-read из уже
// существующих источников (statsService/rakebackService/tournamentManager.list()), турнирное
// ядро НЕ трогаем ни единой строкой — только читаем публичный list().
function buildProgress(tournamentManager: TournamentManager, userId: string): AchievementProgress {
  const stats = aggregateUserStats(userId, null, null); // lifetime
  const rb = getUserRakebackInfo(userId);
  const flatEntries = tournamentManager
    .list()
    .flatMap((t) => t.entries.map((e) => ({ tournamentId: t.id, userId: e.userId, finishPlace: e.finishPlace })));
  const tStats = computeTournamentStats(flatEntries, userId);
  return {
    hands: stats.hands,
    tournamentsPlayed: tStats.tournamentsPlayed,
    tournamentWins: tStats.tournamentWins,
    lifetimeRake: rb.lifetimeRake,
  };
}

export function createAchievementsRouter(tournamentManager: TournamentManager): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { enabled, catalog } = getAchievementsCatalog();
    if (!enabled) {
      res.json({ enabled: false, achievements: [] });
      return;
    }
    const progress = buildProgress(tournamentManager, userId);
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
    const progress = buildProgress(tournamentManager, userId);
    const result = claimAchievement(userId, id, progress);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    creditRewardsWallet(userId, result.reward, 'mission', id);
    sendNotification(userId, 'reward', `Достижение забрано: +${result.reward} HUB`);
    res.json({ reward: result.reward });
  });

  return router;
}

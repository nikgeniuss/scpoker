import { Router } from 'express';
import type { GameManager } from '../game/GameManager.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  getResponsibleGamblingState,
  setResponsibleGamblingLimits,
  setSelfExclusion,
  setAccountTimeout,
} from '../auth/auth.js';
import { aggregateUserStats } from '../game/statsService.js';
import { periodRange } from '../game/responsibleGamblingService.js';
import { readDeposits } from '../payments/depositsStorage.js';
import { depositsTotalChips } from '../payments/depositPollingService.js';

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v);
const isPeriod = (v: unknown): v is 'day' | 'week' | 'month' => v === 'day' || v === 'week' || v === 'month';

// Responsible Gambling (/api/responsible-gambling, ROADMAP §11.2) — лимиты, самоисключение,
// тайм-аут. Каждый под своим admin-тогглом (gameManager.getSettings().responsibleGambling) —
// если выключен, соответствующая правка через PUT/POST отклоняется 403 (UI прячет блок целиком,
// но сервер не доверяет клиенту — как и везде в проекте, §0.13).
export function createResponsibleGamblingRouter(gameManager: GameManager): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const cfg = gameManager.getSettings().responsibleGambling;
    const rg = getResponsibleGamblingState(userId);
    const now = new Date();

    let lossThisPeriod: number | null = null;
    if (rg.lossLimitCents) {
      const { sinceMs } = periodRange(rg.lossLimitPeriod ?? 'day', now);
      const { pnl } = aggregateUserStats(userId, sinceMs, now.getTime());
      lossThisPeriod = Math.max(0, -pnl);
    }

    let depositThisPeriod: number | null = null;
    if (rg.depositLimitCents) {
      const { sinceMs, untilMs } = periodRange(rg.depositLimitPeriod ?? 'day', now);
      depositThisPeriod = depositsTotalChips(readDeposits(), userId, sinceMs, untilMs);
    }

    res.json({ config: cfg, state: rg, lossThisPeriod, depositThisPeriod });
  });

  router.put('/limits', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const cfg = gameManager.getSettings().responsibleGambling;
    const body = req.body as Record<string, unknown>;
    const patch: Parameters<typeof setResponsibleGamblingLimits>[1] = {};

    if (body.depositLimitCents !== undefined) {
      if (!cfg.depositLimitEnabled) { res.status(403).json({ error: 'Лимит на депозит отключён администратором' }); return; }
      if (body.depositLimitCents !== null && !isPositiveInt(body.depositLimitCents)) {
        res.status(400).json({ error: 'depositLimitCents: positive integer | null' }); return;
      }
      patch.depositLimitCents = body.depositLimitCents ?? undefined;
    }
    if (body.depositLimitPeriod !== undefined) {
      if (!isPeriod(body.depositLimitPeriod)) { res.status(400).json({ error: 'depositLimitPeriod: day|week|month' }); return; }
      patch.depositLimitPeriod = body.depositLimitPeriod;
    }
    if (body.lossLimitCents !== undefined) {
      if (!cfg.lossLimitEnabled) { res.status(403).json({ error: 'Лимит на потери отключён администратором' }); return; }
      if (body.lossLimitCents !== null && !isPositiveInt(body.lossLimitCents)) {
        res.status(400).json({ error: 'lossLimitCents: positive integer | null' }); return;
      }
      patch.lossLimitCents = body.lossLimitCents ?? undefined;
    }
    if (body.lossLimitPeriod !== undefined) {
      if (!isPeriod(body.lossLimitPeriod)) { res.status(400).json({ error: 'lossLimitPeriod: day|week|month' }); return; }
      patch.lossLimitPeriod = body.lossLimitPeriod;
    }
    if (body.sessionTimeLimitMinutes !== undefined) {
      if (!cfg.sessionTimeLimitEnabled) { res.status(403).json({ error: 'Лимит времени сессии отключён администратором' }); return; }
      if (body.sessionTimeLimitMinutes !== null && !isPositiveInt(body.sessionTimeLimitMinutes)) {
        res.status(400).json({ error: 'sessionTimeLimitMinutes: positive integer | null' }); return;
      }
      patch.sessionTimeLimitMinutes = body.sessionTimeLimitMinutes ?? undefined;
    }

    const result = setResponsibleGamblingLimits(userId, patch);
    if (!result) { res.status(404).json({ error: 'Пользователь не найден' }); return; }
    res.json(result);
  });

  router.post('/self-exclude', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    if (!gameManager.getSettings().responsibleGambling.selfExclusionEnabled) {
      res.status(403).json({ error: 'Самоисключение отключено администратором' });
      return;
    }
    const { duration } = req.body as { duration?: string };
    let until: string;
    if (duration === 'permanent') {
      until = 'permanent';
    } else if (duration === '6m' || duration === '1y') {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() + (duration === '6m' ? 6 : 12));
      until = d.toISOString();
    } else {
      res.status(400).json({ error: 'duration: 6m | 1y | permanent' });
      return;
    }
    const result = setSelfExclusion(userId, until);
    if ('error' in result) {
      const status = result.error === 'not-found' ? 404 : 409;
      res.status(status).json({ error: result.error === 'already-active' ? 'Самоисключение уже активно' : 'Пользователь не найден' });
      return;
    }
    gameManager.kickUserForCompliance(userId, 'self-excluded', until);
    res.json({ ok: true, until });
  });

  router.post('/timeout', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    if (!gameManager.getSettings().responsibleGambling.timeoutEnabled) {
      res.status(403).json({ error: 'Тайм-аут отключён администратором' });
      return;
    }
    const { duration } = req.body as { duration?: string };
    const hoursByDuration: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };
    const hours = duration ? hoursByDuration[duration] : undefined;
    if (!hours) {
      res.status(400).json({ error: 'duration: 24h | 7d | 30d' });
      return;
    }
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const result = setAccountTimeout(userId, until);
    if ('error' in result) {
      const status = result.error === 'not-found' ? 404 : 409;
      res.status(status).json({ error: result.error === 'already-active' ? 'Тайм-аут уже активен' : 'Пользователь не найден' });
      return;
    }
    gameManager.kickUserForCompliance(userId, 'timeout', until);
    res.json({ ok: true, until });
  });

  return router;
}

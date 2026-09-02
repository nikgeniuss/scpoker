import { Router } from 'express';
import { getRacePublic } from '../game/raceService.js';

// Лидерборд-гонка (/api/race, ROADMAP §10.21.4) — публично, как /api/leaderboard (никакого
// банкролла/приватных данных, только метрика/призовая таблица/история прошлых победителей).
export function createRaceRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const s = getRacePublic();
    const periodEndsAt = s.periodStart + s.periodDays * 86_400_000;
    res.json({ ...s, periodEndsAt });
  });

  return router;
}

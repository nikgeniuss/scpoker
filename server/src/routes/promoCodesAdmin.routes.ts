import { Router } from 'express';
import { adminMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';

// Админ-роуты промокодов (/api/admin/promo-codes/*) — раздача бесплатных входов в турниры (напр.
// подарки в Telegram-группе), НЕ привязаны к одному турниру — валидны по совпадению buyIn (см.
// TournamentManager.createPromoCode). Отдельно от tournamentsAdmin.routes.ts — самостоятельная
// сущность, не CRUD турнира.
export function createPromoCodesAdminRouter(tournamentManager: TournamentManager): Router {
  const router = Router();
  router.use(adminMiddleware);

  router.get('/', (req, res) => {
    res.json(tournamentManager.listPromoCodes());
  });

  router.post('/', (req, res) => {
    const admin = (req as unknown as { user: { id: string } }).user;
    const body = req.body as { buyIn?: unknown; maxRedemptions?: unknown };
    if (typeof body.buyIn !== 'number' || typeof body.maxRedemptions !== 'number') {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    const result = tournamentManager.createPromoCode(body.buyIn, body.maxRedemptions, admin.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post('/:code/deactivate', (req, res) => {
    const result = tournamentManager.deactivatePromoCode(req.params.code);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}

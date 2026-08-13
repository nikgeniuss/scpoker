import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';

// Публичные турнирные роуты (/api/tournaments/*) — список/детали + регистрация/отмена (любой
// авторизованный игрок). Создание/отмена турнира админом — tournamentsAdmin.routes.ts.
export function createTournamentsRouter(tournamentManager: TournamentManager): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    res.json(tournamentManager.list());
  });

  router.get('/:id', (req, res) => {
    const t = tournamentManager.get(req.params.id);
    if (!t) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    res.json(t);
  });

  router.get('/:id/standings', (req, res) => {
    const standings = tournamentManager.getStandings(req.params.id);
    if (!standings) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    res.json(standings);
  });

  router.post('/:id/register', (req, res) => {
    const user = (req as unknown as { user: { id: string; username: string } }).user;
    const result = tournamentManager.register(req.params.id, user.id, user.username);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post('/:id/unregister', (req, res) => {
    const user = (req as unknown as { user: { id: string } }).user;
    const result = tournamentManager.unregister(req.params.id, user.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}

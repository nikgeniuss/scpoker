import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import type { TournamentInfo } from '@poker-room/shared';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';

// promoCode — рабочий bearer-код (кто его знает, тот бесплатно заходит в турнир) — не рассылаем
// обычным игрокам в общем списке/деталях турнира, иначе его можно вытащить из devtools в обход
// раздачи админом (§0.13 — защита всегда на сервере, не полагаемся на клиент). Виден только админу.
function stripPromoCode(t: TournamentInfo, isAdmin: boolean): TournamentInfo {
  if (isAdmin || !t.promoCode) return t;
  const { promoCode: _promoCode, ...rest } = t;
  return rest;
}

// Промокод — bearer-секрет (рабочий код = бесплатный вход), поэтому лимитируем перебор так же,
// как логин/2FA (см. rateLimit.ts, auth.routes.ts) — 10 попыток/5мин с одного IP.
const redeemPromoLimiter = rateLimit('redeem-promo', 10, 5 * 60_000);

// Публичные турнирные роуты (/api/tournaments/*) — список/детали + регистрация/отмена (любой
// авторизованный игрок). Создание/отмена турнира админом — tournamentsAdmin.routes.ts.
export function createTournamentsRouter(tournamentManager: TournamentManager): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const user = (req as unknown as { user: { role?: string } }).user;
    const isAdmin = user.role === 'admin';
    res.json(tournamentManager.list().map(t => stripPromoCode(t, isAdmin)));
  });

  router.get('/:id', (req, res) => {
    const t = tournamentManager.get(req.params.id);
    if (!t) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const user = (req as unknown as { user: { role?: string } }).user;
    res.json(stripPromoCode(t, user.role === 'admin'));
  });

  // Структура выплат — доступна и до старта турнира (standings ниже — только для running).
  router.get('/:id/structure', (req, res) => {
    const structure = tournamentManager.getStructure(req.params.id);
    if (!structure) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    res.json(structure);
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

  router.post('/:id/redeem-promo', redeemPromoLimiter, (req, res) => {
    const user = (req as unknown as { user: { id: string; username: string } }).user;
    const code = (req.body as { code?: unknown }).code;
    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    const result = tournamentManager.redeemPromoCode(req.params.id as string, user.id, user.username, code.trim().toUpperCase());
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

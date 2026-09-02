import { Router, type Request } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';
import type { NetworkInfo } from '../game/antiCollusion.js';
import { getShopCatalog, redeemShopItem } from '../game/loyaltyShopService.js';

// Магазин лояльности (/api/shop, ROADMAP §10.21.6). Вся оркестрация — в redeemShopItem
// (loyaltyShopService.ts), роут — только парсинг запроса и HTTP-обёртка.
function networkFromReq(req: Request): NetworkInfo {
  const deviceIdHeader = req.headers['x-device-id'];
  return { ip: req.ip ?? '', deviceId: typeof deviceIdHeader === 'string' ? deviceIdHeader : '' };
}

export function createShopRouter(tournamentManager: TournamentManager): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getShopCatalog());
  });

  router.post('/redeem', authMiddleware, (req, res) => {
    const user = (req as unknown as { user: { id: string; username: string } }).user;
    const { itemId, tournamentId } = req.body as { itemId?: string; tournamentId?: string };
    if (typeof itemId !== 'string' || typeof tournamentId !== 'string') {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }

    const result = redeemShopItem(tournamentManager, user.id, user.username, itemId, tournamentId, networkFromReq(req));
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}

import { Router, type Request } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';
import type { NetworkInfo } from '../game/antiCollusion.js';
import {
  getShopCatalog,
  redeemShopItem,
  redeemSubscription,
  getSubscriptionStatus,
} from '../game/loyaltyShopService.js';

// Магазин лояльности (/api/shop, ROADMAP §10.21.6). Вся оркестрация — в redeemShopItem
// (loyaltyShopService.ts), роут — только парсинг запроса и HTTP-обёртка.
function networkFromReq(req: Request): NetworkInfo {
  const deviceIdHeader = req.headers['x-device-id'];
  return { ip: req.ip ?? '', deviceId: typeof deviceIdHeader === 'string' ? deviceIdHeader : '' };
}

// hudMode приходит геттером из GameManager — роут не должен тянуть за собой весь GameManager
// ради одного поля настроек (§0.10).
export function createShopRouter(
  tournamentManager: TournamentManager,
  getHudMode: () => 'free' | 'paid',
): Router {
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

  // Статус подписки на HUD соперников (§10.21.13) — режим рума + своя дата окончания.
  router.get('/subscription', authMiddleware, (req, res) => {
    const user = (req as unknown as { user: { id: string } }).user;
    res.json({ mode: getHudMode(), ...getSubscriptionStatus(user.id) });
  });

  // Покупка/продление подписки на HUD. Отдельный роут от /redeem: тикету нужен tournamentId,
  // подписке — нет, и смешивать две валидации в одном хендлере значило бы делать её условной.
  router.post('/subscribe', authMiddleware, (req, res) => {
    const user = (req as unknown as { user: { id: string } }).user;
    const { itemId } = req.body as { itemId?: string };
    if (typeof itemId !== 'string') {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }
    const result = redeemSubscription(user.id, itemId);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}

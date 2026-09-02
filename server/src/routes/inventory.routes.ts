import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getCatalog, getUserInventory, purchaseItem, equipItem } from '../game/inventoryService.js';

// Инвентарь косметики (/api/inventory, ROADMAP §10.21.11). «/» — публичный каталог (без auth,
// как /api/shop), «/me» — личный инвентарь (владение+экипировка), «/purchase»/«/equip» — действия
// игрока. Вся логика — в inventoryService.ts, роут — только парсинг запроса и HTTP-обёртка.
export function createInventoryRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getCatalog());
  });

  router.get('/me', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserInventory(userId));
  });

  router.post('/purchase', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { itemId } = req.body as { itemId?: string };
    if (typeof itemId !== 'string') {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }
    const result = purchaseItem(userId, itemId);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post('/equip', authMiddleware, (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { itemId, type } = req.body as { itemId?: string | null; type?: string };
    if (type !== 'avatarFrame' && type !== 'title' && type !== 'tableGlow') {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }
    if (itemId !== null && typeof itemId !== 'string') {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }
    const result = equipItem(userId, itemId, type);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}

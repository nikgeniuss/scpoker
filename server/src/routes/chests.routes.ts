import { Router } from 'express';
import { getChestsPublic } from '../game/chestService.js';

// Сундуки (/api/chests, ROADMAP §10.21.7) — ПУБЛИЧНО и без авторизации: шансы обязаны быть
// открытыми (непрозрачные шансы = жалобы, недоверие и серая зона регулирования лутбоксов).
// Отдаём только id/название/проценты — веса остаются деталью настройки на сервере.
export function createChestsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getChestsPublic());
  });

  return router;
}

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserTemplates, setUserTemplates, type RoomTemplate } from '../auth/auth.js';

// Шаблоны создания стола текущего юзера (/api/templates). Любой авторизованный.
// Список заменяется целиком (как localStorage-версия). opts хранится opaque.
export function createTemplatesRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserTemplates(userId));
  });

  router.put('/', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const body = req.body;
    if (!Array.isArray(body) || body.length > 50) {
      res.status(400).json({ error: 'templates: массив до 50 элементов' });
      return;
    }
    // Лёгкая нормализация: только {name: string ≤60, opts: object}
    const clean: RoomTemplate[] = body
      .filter(
        (t): t is RoomTemplate =>
          !!t && typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 60 && typeof t.opts === 'object' && t.opts !== null,
      )
      .slice(0, 50);
    res.json(setUserTemplates(userId, clean));
  });

  return router;
}

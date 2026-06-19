import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireClubOwner } from '../middleware/clubMiddleware.js';
import {
  createClub,
  getMyClub,
  updateClub,
  joinByCode,
  submitJoinRequest,
  handleJoinRequest,
  kickMember,
  regenerateInviteCode,
  searchOpenClubs,
} from '../game/clubService.js';

// Роуты клубов (/api/clubs/*). Все требуют авторизации; owner-only — через requireClubOwner.
export function createClubRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // Создать клуб (1 на пользователя)
  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Название обязательно' });
      return;
    }
    const result = createClub((req as unknown as { user: { id: string } }).user.id, name);
    if ('error' in result) {
      res.status(result.error === 'already-owns-club' ? 409 : 400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  // Мой клуб (owner или member)
  router.get('/my', (req, res) => {
    const club = getMyClub((req as unknown as { user: { id: string } }).user.id);
    if (!club) { res.status(404).json({ error: 'not-found' }); return; }
    res.json(club);
  });

  // Вступить по инвайт-коду
  router.post('/join/code', (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Код обязателен' });
      return;
    }
    const result = joinByCode((req as unknown as { user: { id: string } }).user.id, code);
    if ('error' in result) {
      res.status(result.error === 'already-member' ? 409 : 400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Подать заявку на вступление
  router.post('/:id/requests', (req, res) => {
    const result = submitJoinRequest((req as unknown as { user: { id: string } }).user.id, String(req.params.id));
    if ('error' in result) {
      const status = result.error === 'not-found' ? 404 : result.error === 'already-member' ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // Список открытых клубов (принимают заявки без кода)
  router.get('/open', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(searchOpenClubs(q));
  });

  // Обновить настройки клуба (только owner)
  router.put('/:id', requireClubOwner, (req, res) => {
    const { name, openJoin } = req.body;
    const result = updateClub(String(req.params.id), (req as unknown as { user: { id: string } }).user.id, {
      name,
      openJoin: typeof openJoin === 'boolean' ? openJoin : undefined,
    });
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Одобрить / отклонить заявку (только owner)
  router.put('/:id/requests/:userId', requireClubOwner, (req, res) => {
    const { approve } = req.body;
    if (typeof approve !== 'boolean') {
      res.status(400).json({ error: 'approve (boolean) обязателен' });
      return;
    }
    const result = handleJoinRequest(String(req.params.id), (req as unknown as { user: { id: string } }).user.id, String(req.params.userId), approve);
    if ('error' in result) {
      res.status(result.error === 'no-request' ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Кикнуть участника (только owner)
  router.delete('/:id/members/:userId', requireClubOwner, (req, res) => {
    const result = kickMember(String(req.params.id), (req as unknown as { user: { id: string } }).user.id, String(req.params.userId));
    if ('error' in result) {
      const status = result.error === 'not-member' ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // Перегенерировать инвайт-код (только owner)
  router.post('/:id/invite/regenerate', requireClubOwner, (req, res) => {
    const result = regenerateInviteCode(String(req.params.id), (req as unknown as { user: { id: string } }).user.id);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  return router;
}

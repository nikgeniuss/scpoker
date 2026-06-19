import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getOpponentNotes, setOpponentNote } from '../auth/auth.js';

const NOTE_MAX_LEN = 300;

// Приватные заметки на оппонентов текущего юзера (/api/notes). Любой авторизованный.
// targetId → текст. Пустой текст в PUT удаляет заметку.
export function createNotesRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getOpponentNotes(userId));
  });

  router.put('/:targetId', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const targetId = req.params.targetId;
    const text = req.body?.text;
    if (typeof text !== 'string' || text.length > NOTE_MAX_LEN) {
      res.status(400).json({ error: `note: строка до ${NOTE_MAX_LEN} символов` });
      return;
    }
    res.json(setOpponentNote(userId, targetId, text));
  });

  return router;
}

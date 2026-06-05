import { Router } from 'express';
import type { GameManager } from '../game/GameManager.js';
import { readJSON } from '../auth/storage.js';
import { scanDecks } from '../decks/decks.js';

// Публичные роуты (без auth): health, список колод, метаданные стола, дизайн, timebank-config.
// Вынесено из index.ts (ROADMAP §9.3-C). Полные пути — монтируется на '/'.
export function createPublicRouter(gameManager: GameManager): Router {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Список колод карт — публично (используется в админке и в Card-компоненте на клиенте)
  router.get('/api/decks', (req, res) => {
    res.json(scanDecks());
  });

  // Метаданные стола для модалки «Информация о столе» (см. roadmap 10.4).
  // Возвращает RoomInfo (без passwordHash) одной комнаты — данные публичные, auth не требуется.
  router.get('/api/rooms/:id', (req, res) => {
    const list = gameManager.getRoomList();
    const room = list.find(r => r.id === req.params.id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room);
  });

  router.get('/api/design', (req, res) => {
    const design = readJSON('design.json');
    res.json(design);
  });

  // Публичный эндпоинт для CreateRoomModal — клиент не знает глобальных дефолтов и
  // разрешён ли per-table override. Возвращаем только timebank-блок без чувствительной инфы.
  router.get('/api/timebank-config', (req, res) => {
    const s = gameManager.getSettings();
    res.json(s.timebank);
  });

  return router;
}

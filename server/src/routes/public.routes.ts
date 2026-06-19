import { Router } from 'express';
import type { GameManager } from '../game/GameManager.js';
import { readJSON } from '../auth/storage.js';
import { scanDecks } from '../decks/decks.js';
import { getBadBeatPublic } from '../game/badBeatService.js';
import { getRecentWinnersForRoom } from '../game/handHistory.js';
import { aggregateAllUsers, aggregateAllUsersInPeriod } from '../game/statsService.js';

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

  // История победителей стола (см. roadmap 10.4) — последние раздачи: кто выиграл, сколько,
  // комбинация (если было реальное вскрытие). Без карманных карт, публично.
  router.get('/api/rooms/:id/winners', (req, res) => {
    res.json(getRecentWinnersForRoom(req.params.id, 10));
  });

  // Публичная таблица лидеров (см. roadmap 10.5) — только username/pnl/hands игроков-людей,
  // без банкролла/роли/бана (это в /admin/users — admin-only). Забаненные не показываются.
  router.get('/api/leaderboard', (req, res) => {
    const period = req.query.period;
    const now = Date.now();
    const sinceMs = period === '1d' ? now - 86400_000 : period === '7d' ? now - 7 * 86400_000 : null;
    const stats = sinceMs === null ? aggregateAllUsers() : aggregateAllUsersInPeriod(sinceMs, null);
    const users = readJSON('users.json') as { id: string; username: string; banned?: boolean }[];
    const byId = new Map(users.map((u) => [u.id, u]));
    const result = Object.entries(stats)
      .map(([userId, s]) => {
        const u = byId.get(userId);
        if (!u || u.banned) return null;
        return { username: u.username, pnl: s.pnl, hands: s.hands };
      })
      .filter((r): r is { username: string; pnl: number; hands: number } => r !== null);
    res.json(result);
  });

  router.get('/api/design', (req, res) => {
    const design = readJSON('design.json');
    res.json(design);
  });

  // Bad Beat Jackpot — публичная вьюшка для игрок-view/баннера: пул + флаг + таблица выплат.
  router.get('/api/badbeat', (req, res) => {
    res.json(getBadBeatPublic());
  });

  // Публичный эндпоинт для CreateRoomModal — клиент не знает глобальных дефолтов и
  // разрешён ли per-table override. Возвращаем только timebank-блок без чувствительной инфы.
  router.get('/api/timebank-config', (req, res) => {
    const s = gameManager.getSettings();
    res.json(s.timebank);
  });

  return router;
}

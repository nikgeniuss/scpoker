import { Router } from 'express';
import type { GameManager } from '../game/GameManager.js';
import { adminMiddleware } from '../middleware/auth.js';
import { readJSON, writeJSON } from '../auth/storage.js';
import { updateManualMapping } from '../decks/decks.js';
import { validateSettingsPatch } from './settingsValidation.js';

// Админ-роуты (/api/admin/*). Все требуют adminMiddleware (применён на уровне роутера).
// Вынесено из index.ts (ROADMAP §9.3-C).
export function createAdminRouter(gameManager: GameManager): Router {
  const router = Router();
  router.use(adminMiddleware);

  // Ручной mapping для колоды
  router.put('/decks/:id/mapping', (req, res) => {
    const { manualMap } = req.body as { manualMap?: Record<string, string> };
    if (!manualMap) {
      res.status(400).json({ error: 'manualMap обязателен' });
      return;
    }
    const result = updateManualMapping(String(req.params.id), manualMap);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true });
  });

  router.get('/design', (req, res) => {
    const design = readJSON('design.json');
    res.json(design);
  });

  router.put('/design', (req, res) => {
    writeJSON('design.json', req.body);
    res.json({ success: true });
  });

  // Список юзеров — без passwordHash
  router.get('/users', (req, res) => {
    const users = readJSON('users.json') as Array<{
      id: string; username: string; email: string; role: string;
      chips: number; createdAt: string; banned?: boolean; passwordHash: string;
    }>;
    res.json(
      users.map(({ passwordHash, ...rest }) => ({ ...rest, banned: !!rest.banned }))
    );
  });

  // Обновление полей юзера: chips / role / banned / country
  router.patch('/users/:id', (req, res) => {
    const targetId = String(req.params.id);
    const adminId = (req as any).user.id;
    const { chips, role, banned, country } = req.body as { chips?: number; role?: string; banned?: boolean; country?: string | null };
    // Защита от самопрострела: админ не может снять с себя роль или забанить себя.
    // chips себе менять можно (полезно для тестов и пополнения собственного банкролла).
    if (targetId === adminId && (role !== undefined || banned !== undefined)) {
      res.status(400).json({ error: 'Нельзя менять собственную роль или бан' });
      return;
    }
    const users = readJSON('users.json') as Array<any>;
    const idx = users.findIndex(u => u.id === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Юзер не найден' });
      return;
    }
    if (chips !== undefined) {
      if (typeof chips !== 'number' || chips < 0 || !Number.isFinite(chips)) {
        res.status(400).json({ error: 'chips: целое >= 0' });
        return;
      }
      users[idx].chips = Math.floor(chips);
    }
    if (role !== undefined) {
      if (role !== 'admin' && role !== 'player') {
        res.status(400).json({ error: 'role: "admin" | "player"' });
        return;
      }
      users[idx].role = role;
    }
    if (banned !== undefined) {
      if (typeof banned !== 'boolean') {
        res.status(400).json({ error: 'banned: boolean' });
        return;
      }
      users[idx].banned = banned;
    }
    if (country !== undefined) {
      // null/'' — сбросить флаг; иначе — 2 буквы ISO 3166-1 alpha-2
      if (country === null || country === '') {
        delete users[idx].country;
      } else if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) {
        res.status(400).json({ error: 'country: ISO 3166-1 alpha-2 (2 заглавные буквы)' });
        return;
      } else {
        users[idx].country = country;
      }
    }
    writeJSON('users.json', users);
    // Если поменяли chips через админку — пушим актуальный банкролл клиентам этого юзера
    if (chips !== undefined) {
      gameManager.notifyBankroll(targetId, users[idx].chips);
    }
    const { passwordHash, ...rest } = users[idx];
    res.json({ ...rest, banned: !!rest.banned });
  });

  // Список комнат
  router.get('/rooms', (req, res) => {
    res.json(gameManager.getAdminRoomList());
  });

  // Kick игрока из комнаты
  router.post('/rooms/:roomId/kick/:userId', (req, res) => {
    const ok = gameManager.adminKickPlayer(String(req.params.roomId), String(req.params.userId));
    if (!ok) {
      res.status(404).json({ error: 'Комната или игрок не найдены' });
      return;
    }
    res.json({ success: true });
  });

  // Force-close комнаты
  router.delete('/rooms/:roomId', (req, res) => {
    const ok = gameManager.adminForceCloseRoom(String(req.params.roomId));
    if (!ok) {
      res.status(404).json({ error: 'Комната не найдена' });
      return;
    }
    res.json({ success: true });
  });

  // Глобальные настройки
  router.get('/settings', (req, res) => {
    res.json(gameManager.getSettings());
  });

  router.put('/settings', (req, res) => {
    const result = validateSettingsPatch(req.body as Record<string, unknown>);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const { patch } = result;
    const updated = gameManager.updateSettings(patch as Partial<Parameters<typeof gameManager.updateSettings>[0]>);
    // Если изменился botMode — синхронизировать BotManager (он сам решит enable/disable)
    if (patch.botMode !== undefined) {
      gameManager.getBotManager().updateSettings(updated.botMode);
    }
    res.json(updated);
  });

  // ===== Боты =====

  // Список ботов с runtime метриками (для админ-вкладки «Боты»)
  router.get('/bots', (req, res) => {
    const bm = gameManager.getBotManager();
    const list = bm.getAllBots().map((b) => {
      const meta = bm.getBotMeta(b.id);
      return {
        id: b.id,
        username: b.username,
        chips: b.chips,
        targetPnL: b.targetPnL,
        persona: b.persona,
        roomId: meta?.roomId ?? null,
        realizedPnL: meta?.runtime.realizedPnL ?? 0,
        handsPlayed: meta?.runtime.handsPlayed ?? 0,
        bluffCountLast50: meta ? meta.runtime.bluffEventHands.filter((h) => h > meta.runtime.handsPlayed - 50).length : 0,
        bluffCallCountLast50: meta ? meta.runtime.bluffCallEventHands.filter((h) => h > meta.runtime.handsPlayed - 50).length : 0,
      };
    });
    res.json(list);
  });

  // Обновить targetPnL и/или chips конкретного бота
  router.patch('/bots/:id', (req, res) => {
    const { targetPnL, chips } = req.body as { targetPnL?: string; chips?: number };
    const bm = gameManager.getBotManager();
    if (targetPnL !== undefined) {
      if (targetPnL !== 'zero' && targetPnL !== 'plus' && targetPnL !== 'minus') {
        res.status(400).json({ error: 'targetPnL: "zero" | "plus" | "minus"' });
        return;
      }
      const ok = bm.updateBotTarget(String(req.params.id), targetPnL);
      if (!ok) {
        res.status(404).json({ error: 'Бот не найден' });
        return;
      }
    }
    if (chips !== undefined) {
      if (typeof chips !== 'number' || chips < 0 || chips > 10000000 || !Number.isFinite(chips)) {
        res.status(400).json({ error: 'chips: 0..10000000' });
        return;
      }
      const ok = bm.setBotChips(String(req.params.id), Math.floor(chips));
      if (!ok) {
        res.status(404).json({ error: 'Бот не найден' });
        return;
      }
    }
    res.json({ success: true });
  });

  // Массовое пополнение банкроллов всех ботов
  router.post('/bots/refill', (req, res) => {
    const { chips } = req.body as { chips?: number };
    const amount = typeof chips === 'number' && chips >= 0 && chips <= 10000000 && Number.isFinite(chips)
      ? Math.floor(chips)
      : 100000;
    const bm = gameManager.getBotManager();
    const updated = bm.refillAllBankrolls(amount);
    res.json({ refilled: updated, chips: amount });
  });

  return router;
}

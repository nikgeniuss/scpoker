import { Router } from 'express';
import type { GameManager } from '../game/GameManager.js';
import type { User } from '../auth/auth.js';
import { adminMiddleware } from '../middleware/auth.js';
import { readJSON, writeJSON } from '../auth/storage.js';
import { updateManualMapping } from '../decks/decks.js';
import { validateSettingsPatch } from './settingsValidation.js';
import { aggregateUserStats, aggregateAllUsers, overviewStats, tableStats, formatStats } from '../game/statsService.js';
import { getHandsForUser } from '../game/handHistory.js';
import { getBadBeatState, updateBadBeat, topUpBadBeat, sumBadBeatHits } from '../game/badBeatService.js';
import { countTablesOpened, roomNameMap, readRoomEvents } from '../game/roomEvents.js';
import { readFrozenTableEvents } from '../game/frozenTableLog.js';
import { recordChipOp, getChipOpsLog } from '../game/chipOpsLog.js';

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

  router.get('/lobby-design', (req, res) => {
    res.json(readJSON('lobbyDesign.json'));
  });

  router.put('/lobby-design', (req, res) => {
    const { design } = req.body as { design?: string };
    if (design !== 'classic' && design !== 'redesign') {
      res.status(400).json({ error: 'design: "classic" | "redesign"' });
      return;
    }
    writeJSON('lobbyDesign.json', { design });
    res.json({ design });
  });

  // Список юзеров — без passwordHash, со статистикой за всё время (PnL/руки — для сортировки/деталей)
  router.get('/users', (req, res) => {
    const users = readJSON('users.json') as Array<{
      id: string; username: string; email: string; role: string;
      chips: number; createdAt: string; banned?: boolean; passwordHash: string; roomTemplates?: unknown;
    }>;
    const stats = aggregateAllUsers();
    res.json(
      // passwordHash и roomTemplates не отдаём в список (rest-siblings, omit)
      users.map(({ passwordHash: _passwordHash, roomTemplates: _roomTemplates, ...rest }) => {
        const s = stats[rest.id];
        return { ...rest, banned: !!rest.banned, pnl: s?.pnl ?? 0, hands: s?.hands ?? 0 };
      })
    );
  });

  // Статистика игрока за период: all (всё время) / 7d / custom (?from=&to= в epoch ms)
  router.get('/users/:id/stats', (req, res) => {
    const userId = String(req.params.id);
    const period = String(req.query.period ?? 'all');
    let since: number | null = null;
    let until: number | null = null;
    if (period === '7d') {
      since = Date.now() - 7 * 24 * 3600 * 1000;
    } else if (period === 'custom') {
      const from = Number(req.query.from);
      const to = Number(req.query.to);
      if (Number.isFinite(from)) since = from;
      if (Number.isFinite(to)) until = to;
    }
    res.json(aggregateUserStats(userId, since, until));
  });

  // История рук игрока для админа (§0.12) — все карманные без редакции (revealAll).
  router.get('/users/:id/hands', (req, res) => {
    const userId = String(req.params.id);
    const raw = Number((req.query.limit as string) ?? 50);
    const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? raw : 50));
    res.json(getHandsForUser(userId, limit, true));
  });

  // ===== Сводная статистика для админ-вкладки «Данные» =====
  // Диапазон — из ?from=&to= (epoch ms); обе границы опциональны (null = без ограничения).

  // Сводка за период: игры, PnL игроков, рейк, активные столы, открыто столов, бэд-бит.
  router.get('/stats/overview', (req, res) => {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const since = Number.isFinite(from) ? from : null;
    const until = Number.isFinite(to) ? to : null;
    const ov = overviewStats(since, until);
    const tablesOpened = countTablesOpened(readRoomEvents(), since, until);
    const byFormat = formatStats(since, until);
    // badBeat — выплачено из джекпота за период; badBeatPool — текущий пул.
    res.json({ ...ov, tablesOpened, badBeat: sumBadBeatHits(since, until), badBeatPool: getBadBeatState().pool, byFormat });
  });

  // Разбивка по столам за период (для дроилдауна). Имя стола — из лога открытия / активных комнат.
  router.get('/stats/tables', (req, res) => {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const since = Number.isFinite(from) ? from : null;
    const until = Number.isFinite(to) ? to : null;
    const tables = tableStats(since, until);
    const names = roomNameMap(readRoomEvents());
    const live = gameManager.getAdminRoomList() as Array<{ id: string; name: string }>;
    for (const r of live) if (!names[r.id]) names[r.id] = r.name;
    res.json(tables.map((t) => ({ ...t, name: names[t.roomId] ?? t.roomId })));
  });

  // Обновление полей юзера: chips / role / banned / country
  router.patch('/users/:id', (req, res) => {
    const targetId = String(req.params.id);
    const adminId = (req as unknown as { user: { id: string } }).user.id;
    const { chips, role, banned, country, alias, note } = req.body as { chips?: number; role?: string; banned?: boolean; country?: string | null; alias?: string | null; note?: string | null };
    // Защита от самопрострела: админ не может снять с себя роль или забанить себя.
    // chips себе менять можно (полезно для тестов и пополнения собственного банкролла).
    if (targetId === adminId && (role !== undefined || banned !== undefined)) {
      res.status(400).json({ error: 'Нельзя менять собственную роль или бан' });
      return;
    }
    const users = readJSON('users.json') as User[];
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
    if (alias !== undefined) {
      // null/'' — сбросить; иначе строка ≤40 символов
      if (alias === null || alias === '') {
        delete users[idx].alias;
      } else if (typeof alias !== 'string' || alias.length > 40) {
        res.status(400).json({ error: 'alias: строка ≤40 символов' });
        return;
      } else {
        users[idx].alias = alias;
      }
    }
    if (note !== undefined) {
      // null/'' — сбросить; иначе строка ≤500 символов
      if (note === null || note === '') {
        delete users[idx].note;
      } else if (typeof note !== 'string' || note.length > 500) {
        res.status(400).json({ error: 'note: строка ≤500 символов' });
        return;
      } else {
        users[idx].note = note;
      }
    }
    writeJSON('users.json', users);
    // Если поменяли chips через админку — пушим актуальный банкролл + уведомление игроку
    if (chips !== undefined) {
      gameManager.notifyBankroll(targetId, users[idx].chips);
      gameManager.sendInboxNotification(targetId, 'chips', `Баланс изменён: ${(users[idx].chips / 100).toFixed(2)}`);
    }
    if (banned !== undefined) {
      const text = banned ? 'Ваш аккаунт заблокирован' : 'Ваш аккаунт разблокирован';
      gameManager.sendInboxNotification(targetId, banned ? 'ban' : 'unban', text);
    }
    const { passwordHash: _passwordHash, ...rest } = users[idx];
    res.json({ ...rest, banned: !!rest.banned });
  });

  // Массовая выдача / возврат фишек списку юзеров
  router.post('/users/bulk-chips', (req, res) => {
    const { userIds, amount, mode } = req.body as { userIds?: string[]; amount?: number; mode?: 'add' | 'subtract' };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'userIds: непустой массив' });
      return;
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount) || amount > 100_000_000) {
      res.status(400).json({ error: 'amount: число > 0 и ≤ 1 000 000.00' });
      return;
    }
    if (mode !== 'add' && mode !== 'subtract') {
      res.status(400).json({ error: 'mode: "add" | "subtract"' });
      return;
    }
    const delta = Math.floor(amount);
    const users = readJSON('users.json') as Array<{ id: string; username: string; chips: number }>;
    let updated = 0;
    for (const uid of userIds) {
      const idx = users.findIndex((u) => u.id === uid);
      if (idx === -1) continue;
      users[idx].chips = mode === 'add'
        ? users[idx].chips + delta
        : Math.max(0, users[idx].chips - delta);
      updated++;
    }
    writeJSON('users.json', users);
    const affectedUsernames: string[] = [];
    for (const uid of userIds) {
      const u = users.find((x) => x.id === uid);
      if (u) {
        affectedUsernames.push(u.username);
        gameManager.notifyBankroll(uid, u.chips);
        const text = mode === 'add'
          ? `Начислено ${(delta / 100).toFixed(2)}`
          : `Списано ${(delta / 100).toFixed(2)}`;
        gameManager.sendInboxNotification(uid, 'chips', text);
      }
    }
    const adminUsername = (req as unknown as { user: { username: string } }).user.username;
    recordChipOp({ by: adminUsername, mode, amount: delta, usernames: affectedUsernames });
    res.json({ updated });
  });

  // История массовых выдач/возвратов фишек (ROADMAP §10.9)
  router.get('/chip-ops', (req, res) => {
    res.json(getChipOpsLog());
  });

  // Удаление юзера (необратимо). Нельзя удалить самого себя.
  router.delete('/users/:id', (req, res) => {
    const targetId = String(req.params.id);
    const adminId = (req as unknown as { user: { id: string } }).user.id;
    if (targetId === adminId) {
      res.status(400).json({ error: 'Нельзя удалить самого себя' });
      return;
    }
    const users = readJSON('users.json') as Array<{ id: string }>;
    const idx = users.findIndex((u) => u.id === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Юзер не найден' });
      return;
    }
    users.splice(idx, 1);
    writeJSON('users.json', users);
    res.json({ success: true });
  });

  // Список комнат
  router.get('/rooms', (req, res) => {
    res.json(gameManager.getAdminRoomList());
  });

  // Журнал восстановлений зависших столов (table watchdog, см. tableWatchdog.ts/frozenTableLog.ts).
  // Последние limit записей (по умолчанию 50), новые первыми.
  router.get('/frozen-tables', (req, res) => {
    const raw = Number((req.query.limit as string) ?? 50);
    const limit = Math.min(200, Math.max(1, Number.isFinite(raw) ? raw : 50));
    const events = readFrozenTableEvents();
    res.json(events.slice(-limit).reverse());
  });

  // Kick игрока из комнаты. body.cooldownMin (0..1440) — на сколько минут закрыть повторный
  // вход за этот стол (временный кик, без бана). 0/не задан — мгновенный кик без блокировки.
  router.post('/rooms/:roomId/kick/:userId', (req, res) => {
    const rawCooldown = (req.body as { cooldownMin?: unknown }).cooldownMin;
    const cooldownMin = typeof rawCooldown === 'number' && Number.isFinite(rawCooldown)
      ? Math.max(0, Math.min(1440, Math.floor(rawCooldown)))
      : 0;
    const ok = gameManager.adminKickPlayer(String(req.params.roomId), String(req.params.userId), cooldownMin);
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

  // ===== Bad Beat Jackpot (Фаза 1: пул + конфиг) =====
  router.get('/badbeat', (req, res) => {
    res.json(getBadBeatState());
  });

  router.put('/badbeat', (req, res) => {
    res.json(updateBadBeat(req.body as Record<string, unknown>));
  });

  router.post('/badbeat/topup', (req, res) => {
    const amount = Number((req.body as { amount?: unknown }).amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount должен быть > 0' });
      return;
    }
    const by = String((req as unknown as { user?: { username?: string } }).user?.username ?? 'admin');
    res.json(topUpBadBeat(amount, by));
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
        totalPnL: b.totalPnL,
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

  // Сброс totalPnL всех ботов в 0 (§9.2: дисбаланс)
  router.post('/bots/reset-pnl', (_req, res) => {
    const bm = gameManager.getBotManager();
    const count = bm.resetAllTotalPnL();
    res.json({ reset: count });
  });

  // Рассылка broadcast-уведомления всем игрокам (ROADMAP §10.7)
  router.post('/inbox/broadcast', (req, res) => {
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Текст обязателен' });
      return;
    }
    const msg = text.trim().slice(0, 500);
    const users = readJSON('users.json') as Array<{ id: string }>;
    for (const u of users) {
      gameManager.sendInboxNotification(u.id, 'broadcast', msg);
    }
    res.json({ success: true, count: users.length });
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

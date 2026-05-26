// Конфиг первым импортом — он сам грузит .env. Иначе другие модули прочитают process.env слишком рано.
import { JWT_SECRET, ALLOWED_ORIGINS } from './config.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { GameManager } from './game/GameManager.js';
import { registerUser, loginUser, migratePublicIds } from './auth/auth.js';
import { authMiddleware, adminMiddleware } from './middleware/auth.js';
import { readJSON, writeJSON } from './auth/storage.js';
import { scanDecks, updateManualMapping, IMAGES_DIR } from './decks/decks.js';

// CORS:
// - В dev (ALLOWED_ORIGINS не задан) — origin: '*', credentials: false.
// - В проде — origin: whitelist + credentials: true.
// origin: '*' + credentials: true в браузере не работает — нельзя смешивать.
const corsConfig =
  ALLOWED_ORIGINS === '*'
    ? { origin: '*' as const, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: false }
    : { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true };

interface SocketUser {
  id: string;
  username: string;
  role: string;
}

// Emoji-реакции: список разрешённых + кулдаун 2 сек на пользователя (см. roadmap 10.12)
const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🤔', '😎', '🤑', '😠', '🎲'];
const EMOJI_COOLDOWN_MS = 2000;
const lastEmojiAt = new Map<string, number>();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsConfig,
  transports: ['websocket', 'polling'],
});

app.use(cors(corsConfig));
app.use(express.json());

// Статика колод карт: images/<deckName>/*.png → /decks/<deckName>/*.png.
// Картинки публичные (нужны всем игрокам для отрисовки карт), auth не требуется.
app.use(
  '/decks',
  express.static(IMAGES_DIR, {
    maxAge: 0,
    etag: false,
    lastModified: false,
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }),
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Список колод карт — публично (используется в админке и в Card-компоненте на клиенте)
app.get('/api/decks', (req, res) => {
  res.json(scanDecks());
});

// Ручной mapping для колоды — только админ
app.put('/api/admin/decks/:id/mapping', adminMiddleware, (req, res) => {
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

app.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  
  // Проверяем, что все три поля пришли
  if (!username || !password || !email) {
    res.status(400).json({ error: 'Username, email and password required' });
    return;
  }
  
  // Передаём email в registerUser
  const user = registerUser(username, password, email);
  
  if (!user) {
    // Ошибка может быть и из-за email тоже
    res.status(409).json({ error: 'Username or email already exists' });
    return;
  }
  
  const token = loginUser(username, password);
  
  // Возвращаем email в ответе
  res.json({ 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      email: user.email,
      role: user.role 
    } 
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
  const token = loginUser(username, password);
  if (!token) { res.status(401).json({ error: 'Invalid credentials' }); return; }
  const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  res.json({ token, user: { id: decoded.id, username: decoded.username, role: decoded.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const jwtUser = (req as any).user;
  // Догружаем актуальные chips/publicId/country из users.json — клиенту нужен банкролл для BuyInModal
  let chips = 0;
  let publicId: string | undefined;
  let country: string | undefined;
  try {
    const users = readJSON('users.json') as Array<{ id: string; chips: number; publicId?: string; country?: string }>;
    const u = users.find(x => x.id === jwtUser.id);
    if (u) {
      chips = u.chips;
      publicId = u.publicId;
      country = u.country;
    }
  } catch {}
  res.json({ user: { ...jwtUser, chips, publicId, country } });
});

// Метаданные стола для модалки «Информация о столе» (см. roadmap 10.4).
// Возвращает RoomInfo (без passwordHash) одной комнаты — данные публичные, auth не требуется.
app.get('/api/rooms/:id', (req, res) => {
  const list = gameManager.getRoomList();
  const room = list.find(r => r.id === req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json(room);
});

app.get('/api/admin/design', adminMiddleware, (req, res) => {
  const design = readJSON('design.json');
  res.json(design);
});

app.put('/api/admin/design', adminMiddleware, (req, res) => {
  writeJSON('design.json', req.body);
  res.json({ success: true });
});

// Список юзеров — без passwordHash
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = readJSON('users.json') as Array<{
    id: string; username: string; email: string; role: string;
    chips: number; createdAt: string; banned?: boolean; passwordHash: string;
  }>;
  res.json(
    users.map(({ passwordHash, ...rest }) => ({ ...rest, banned: !!rest.banned }))
  );
});

// Обновление полей юзера: chips / role / banned / country
app.patch('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const targetId = req.params.id;
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

app.get('/api/design', (req, res) => {
  const design = readJSON('design.json');
  res.json(design);
});

const gameManager = new GameManager(io);

// Admin: список комнат
app.get('/api/admin/rooms', adminMiddleware, (req, res) => {
  res.json(gameManager.getAdminRoomList());
});

// Admin: kick игрока из комнаты
app.post('/api/admin/rooms/:roomId/kick/:userId', adminMiddleware, (req, res) => {
  const ok = gameManager.adminKickPlayer(req.params.roomId, req.params.userId);
  if (!ok) {
    res.status(404).json({ error: 'Комната или игрок не найдены' });
    return;
  }
  res.json({ success: true });
});

// Admin: force-close комнаты
app.delete('/api/admin/rooms/:roomId', adminMiddleware, (req, res) => {
  const ok = gameManager.adminForceCloseRoom(req.params.roomId);
  if (!ok) {
    res.status(404).json({ error: 'Комната не найдена' });
    return;
  }
  res.json({ success: true });
});

// Admin: глобальные настройки
app.get('/api/admin/settings', adminMiddleware, (req, res) => {
  res.json(gameManager.getSettings());
});

app.put('/api/admin/settings', adminMiddleware, (req, res) => {
  const { turnDurationMs, autostartDelayMs, defaultPlayerChips, timebank, botMode } = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const isPositiveInt = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v);
  const isNonNegInt = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);

  if (turnDurationMs !== undefined) {
    if (!isPositiveInt(turnDurationMs) || turnDurationMs < 5000 || turnDurationMs > 300000) {
      res.status(400).json({ error: 'turnDurationMs: 5000–300000 (мс)' });
      return;
    }
    patch.turnDurationMs = turnDurationMs;
  }
  if (autostartDelayMs !== undefined) {
    if (!isPositiveInt(autostartDelayMs) || autostartDelayMs < 0 || autostartDelayMs > 120000) {
      res.status(400).json({ error: 'autostartDelayMs: 0–120000 (мс)' });
      return;
    }
    patch.autostartDelayMs = autostartDelayMs;
  }
  if (defaultPlayerChips !== undefined) {
    if (!isPositiveInt(defaultPlayerChips) || defaultPlayerChips < 1 || defaultPlayerChips > 1000000) {
      res.status(400).json({ error: 'defaultPlayerChips: 1–1000000' });
      return;
    }
    patch.defaultPlayerChips = defaultPlayerChips;
  }
  if (timebank !== undefined) {
    if (!timebank || typeof timebank !== 'object') {
      res.status(400).json({ error: 'timebank: object' });
      return;
    }
    const t = timebank as Record<string, unknown>;
    const tbPatch: Record<string, unknown> = {};
    if (t.enabled !== undefined) {
      if (typeof t.enabled !== 'boolean') {
        res.status(400).json({ error: 'timebank.enabled: boolean' });
        return;
      }
      tbPatch.enabled = t.enabled;
    }
    if (t.allowPerTableOverride !== undefined) {
      if (typeof t.allowPerTableOverride !== 'boolean') {
        res.status(400).json({ error: 'timebank.allowPerTableOverride: boolean' });
        return;
      }
      tbPatch.allowPerTableOverride = t.allowPerTableOverride;
    }
    if (t.startSec !== undefined) {
      if (!isNonNegInt(t.startSec) || t.startSec > 600) {
        res.status(400).json({ error: 'timebank.startSec: 0..600' });
        return;
      }
      tbPatch.startSec = t.startSec;
    }
    if (t.bonusSec !== undefined) {
      if (!isNonNegInt(t.bonusSec) || t.bonusSec > 600) {
        res.status(400).json({ error: 'timebank.bonusSec: 0..600' });
        return;
      }
      tbPatch.bonusSec = t.bonusSec;
    }
    if (t.bonusEveryHands !== undefined) {
      if (!isPositiveInt(t.bonusEveryHands) || t.bonusEveryHands > 1000) {
        res.status(400).json({ error: 'timebank.bonusEveryHands: 1..1000' });
        return;
      }
      tbPatch.bonusEveryHands = t.bonusEveryHands;
    }
    if (t.capSec !== undefined) {
      if (!isNonNegInt(t.capSec) || t.capSec > 600) {
        res.status(400).json({ error: 'timebank.capSec: 0..600' });
        return;
      }
      tbPatch.capSec = t.capSec;
    }
    patch.timebank = tbPatch;
  }
  if (botMode !== undefined) {
    if (!botMode || typeof botMode !== 'object') {
      res.status(400).json({ error: 'botMode: object' });
      return;
    }
    const b = botMode as Record<string, unknown>;
    const bmPatch: Record<string, unknown> = {};
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') {
        res.status(400).json({ error: 'botMode.enabled: boolean' });
        return;
      }
      bmPatch.enabled = b.enabled;
    }
    if (b.peekMode !== undefined) {
      if (b.peekMode !== 'river' && b.peekMode !== 'turn' && b.peekMode !== 'full') {
        res.status(400).json({ error: 'botMode.peekMode: "river" | "turn" | "full"' });
        return;
      }
      bmPatch.peekMode = b.peekMode;
    }
    if (b.tablesPerLevel !== undefined) {
      if (!isPositiveInt(b.tablesPerLevel) || b.tablesPerLevel > 5) {
        res.status(400).json({ error: 'botMode.tablesPerLevel: 1..5' });
        return;
      }
      bmPatch.tablesPerLevel = b.tablesPerLevel;
    }
    if (b.botsPerTable !== undefined) {
      if (!isPositiveInt(b.botsPerTable) || b.botsPerTable < 2 || b.botsPerTable > 8) {
        res.status(400).json({ error: 'botMode.botsPerTable: 2..8' });
        return;
      }
      bmPatch.botsPerTable = b.botsPerTable;
    }
    if (b.defaultBuyInBb !== undefined) {
      if (!isPositiveInt(b.defaultBuyInBb) || b.defaultBuyInBb < 20 || b.defaultBuyInBb > 1000) {
        res.status(400).json({ error: 'botMode.defaultBuyInBb: 20..1000' });
        return;
      }
      bmPatch.defaultBuyInBb = b.defaultBuyInBb;
    }
    if (b.refillIntervalMs !== undefined) {
      if (!isPositiveInt(b.refillIntervalMs) || b.refillIntervalMs < 30000 || b.refillIntervalMs > 600000) {
        res.status(400).json({ error: 'botMode.refillIntervalMs: 30000..600000 (мс)' });
        return;
      }
      bmPatch.refillIntervalMs = b.refillIntervalMs;
    }
    patch.botMode = bmPatch;
    // Применить через GameManager.updateSettings — он сам трансформирует deep merge.
    // Но БотManager хранит свою копию settings — нужно синхронизировать после.
  }
  const updated = gameManager.updateSettings(patch as Partial<Parameters<typeof gameManager.updateSettings>[0]>);
  // Если изменился botMode — синхронизировать BotManager (он сам решит enable/disable)
  if (botMode !== undefined) {
    gameManager.getBotManager().updateSettings(updated.botMode);
  }
  res.json(updated);
});

// Публичный эндпоинт для CreateRoomModal — клиент не знает глобальных дефолтов и
// разрешён ли per-table override. Возвращаем только timebank-блок без чувствительной инфы.
app.get('/api/timebank-config', (req, res) => {
  const s = gameManager.getSettings();
  res.json(s.timebank);
});

// ===== Admin: боты =====

// Список ботов с runtime метриками (для админ-вкладки «Боты»)
app.get('/api/admin/bots', adminMiddleware, (req, res) => {
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
      bluffCountLast50: meta?.runtime.bluffCountLast50 ?? 0,
      bluffCallCountLast50: meta?.runtime.bluffCallCountLast50 ?? 0,
    };
  });
  res.json(list);
});

// Обновить targetPnL и/или chips конкретного бота
app.patch('/api/admin/bots/:id', adminMiddleware, (req, res) => {
  const { targetPnL, chips } = req.body as { targetPnL?: string; chips?: number };
  const bm = gameManager.getBotManager();
  if (targetPnL !== undefined) {
    if (targetPnL !== 'zero' && targetPnL !== 'plus' && targetPnL !== 'minus') {
      res.status(400).json({ error: 'targetPnL: "zero" | "plus" | "minus"' });
      return;
    }
    const ok = bm.updateBotTarget(req.params.id, targetPnL);
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
    const ok = bm.setBotChips(req.params.id, Math.floor(chips));
    if (!ok) {
      res.status(404).json({ error: 'Бот не найден' });
      return;
    }
  }
  res.json({ success: true });
});

// Массовое пополнение банкроллов всех ботов
app.post('/api/admin/bots/refill', adminMiddleware, (req, res) => {
  const { chips } = req.body as { chips?: number };
  const amount = typeof chips === 'number' && chips >= 0 && chips <= 10000000 && Number.isFinite(chips)
    ? Math.floor(chips)
    : 100000;
  const bm = gameManager.getBotManager();
  const updated = bm.refillAllBankrolls(amount);
  res.json({ refilled: updated, chips: amount });
});

// Сокет-middleware: проверка JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No token'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SocketUser;
    socket.data.user = decoded;

    // Single-session: при новом подключении того же юзера — отрубаем все его старые сокеты,
    // чтобы вторая вкладка не перехватывала события у первой
    for (const [, existing] of io.sockets.sockets) {
      const eu = existing.data?.user as SocketUser | undefined;
      if (eu && eu.id === decoded.id) {
        existing.emit('forceDisconnect', { reason: 'another-session' });
        existing.disconnect(true);
      }
    }

    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user as SocketUser;
  console.log('User connected:', socket.id, user.username);

  socket.on('lobby:subscribe', () => {
    socket.join('lobby');
    socket.emit('roomList', gameManager.getRoomList());
  });

  socket.on('lobby:unsubscribe', () => {
    socket.leave('lobby');
  });

  socket.on('createRoom', (data: { name: string; description?: string; smallBlind: number; bigBlind: number; maxPlayers: number; password?: string; turnDurationSec?: number; buyInMinBb?: number; buyInMaxBb?: number; timebank?: { enabled: boolean; startSec: number; bonusSec: number; bonusEveryHands: number; capSec: number } }) => {
    // Если клиент не прислал turnDurationSec — берём глобальный settings (legacy-клиенты)
    const defaultTurnSec = Math.round(gameManager.getSettings().turnDurationMs / 1000);
    const result = gameManager.createRoom(
      {
        name: data.name,
        description: data.description,
        smallBlind: data.smallBlind,
        bigBlind: data.bigBlind,
        maxPlayers: data.maxPlayers,
        password: data.password,
        turnDurationSec: data.turnDurationSec ?? defaultTurnSec,
        // Дефолтный диапазон бай-ина для legacy-клиентов — 20-100 BB
        buyInMinBb: data.buyInMinBb ?? 20,
        buyInMaxBb: data.buyInMaxBb ?? 100,
        // timebank — необязательное поле. GameManager.createRoom проверит allowPerTableOverride
        // и либо применит его, либо проигнорирует, скопировав глобал.
        timebank: data.timebank,
      },
      user.username,
    );
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }
    // Создатель автоматически входит в свою комнату с максимальным доступным бай-ином.
    // addPlayer без buyInAmount сам возьмёт min(bankroll, bigBlind*maxBb).
    socket.join(result.roomId);
    const added = gameManager.addPlayer(result.roomId, user.id, socket.id, user.username);
    if (!added) {
      // Чаще всего — банкролл меньше минимального бай-ина; откатываем созданную комнату
      gameManager.adminForceCloseRoom(result.roomId);
      socket.emit('error', { message: 'Недостаточно фишек для входа за стол. Обратитесь к админу.' });
      return;
    }
    socket.emit('roomCreated', { roomId: result.roomId });
  });

  socket.on('leaveRoom', (data: { roomId: string }) => {
    socket.leave(data.roomId);
    gameManager.removePlayer(data.roomId, user.id);
  });

  socket.on('requestGameState', (data: { roomId: string }) => {
    // Базовая проверка — комната существует и юзер в ней
    const baseState = gameManager.getGameState(data.roomId);
    if (!baseState) {
      socket.emit('joinDenied', { reason: 'not-found' });
      return;
    }
    const isInRoom = baseState.players.some(p => p.id === user.id);
    if (!isInRoom) {
      socket.emit('joinDenied', { reason: 'not-found' });
      return;
    }
    socket.join(data.roomId);
    gameManager.addPlayer(data.roomId, user.id, socket.id, user.username);
    // Персональный state с учётом viewer + admin-peek (если включён)
    const withPeek = gameManager.isAdminPeekSocket(socket.id);
    const personalState = gameManager.getGameState(data.roomId, user.id, withPeek);
    if (personalState) socket.emit('gameUpdate', personalState);
    const endsAt = gameManager.getCountdownEndsAt(data.roomId);
    socket.emit('startCountdown', { endsAt });
  });

  // Admin-peek: «глаз админа» — карты всех игроков + следующие 5 карт колоды.
  // Серверная проверка роли — обязательна (нельзя доверять клиенту).
  socket.on('adminPeekToggle', (data: { enabled: boolean; roomId?: string }) => {
    if (user.role !== 'admin') {
      socket.emit('error', { message: 'Только для админа' });
      return;
    }
    gameManager.setAdminPeek(socket.id, !!data?.enabled);
    // Сразу пушим этому сокету свежий state — чтобы переключение мгновенно отразилось в UI
    if (data?.roomId) {
      const withPeek = gameManager.isAdminPeekSocket(socket.id);
      const state = gameManager.getGameState(data.roomId, user.id, withPeek);
      if (state) socket.emit('gameUpdate', state);
    }
  });

  socket.on('joinRoom', (data: { roomId: string; password?: string; buyInAmount?: number }) => {
    const denyReason = gameManager.canJoinRoom(data.roomId, user.id, data.password, data.buyInAmount);
    if (denyReason) {
      socket.emit('joinDenied', { reason: denyReason });
      return;
    }
    socket.join(data.roomId);
    const added = gameManager.addPlayer(data.roomId, user.id, socket.id, user.username, data.buyInAmount);
    if (!added) {
      socket.emit('joinDenied', { reason: 'invalid-buyin' });
      return;
    }
    socket.emit('roomJoined', { roomId: data.roomId });
  });

  socket.on('playerAction', (data: { roomId: string; action: string; amount?: number }) => {
    gameManager.handlePlayerAction(data.roomId, user.id, data.action, data.amount);
  });

  socket.on('startGame', (data: { roomId: string }) => {
    gameManager.startGame(data.roomId);
  });

  // Emoji-реакция: клиент шлёт {roomId, emoji}; сервер валидирует и broadcast'ит всем в комнате.
  // Rate-limit: 1 реакция в EMOJI_COOLDOWN_MS на пользователя.
  socket.on('sendEmoji', (data: { roomId: string; emoji: string }) => {
    if (!data || typeof data.roomId !== 'string' || typeof data.emoji !== 'string') return;
    if (!ALLOWED_EMOJI.includes(data.emoji)) return;
    if (!socket.rooms.has(data.roomId)) return;
    const now = Date.now();
    const last = lastEmojiAt.get(user.id) || 0;
    if (now - last < EMOJI_COOLDOWN_MS) return;
    lastEmojiAt.set(user.id, now);
    io.to(data.roomId).emit('emojiBroadcast', { playerId: user.id, emoji: data.emoji });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id, user.username);
    // Admin-peek привязан к socketId — на disconnect снимаем сразу,
    // иначе Set растёт навсегда (старые мёртвые socketId'ы остаются).
    gameManager.clearAdminPeek(socket.id);
    // Защита от гонки с single-session middleware: при refresh старый сокет получает
    // disconnect, но новый сокет того же юзера уже подключился (или вот-вот подключится).
    // Откладываем handleDisconnect и пропускаем его, если в io есть другой активный сокет
    // того же user.id. Иначе игрока бы удалили из комнаты прямо при refresh.
    setTimeout(() => {
      for (const [, s] of io.sockets.sockets) {
        const u = s.data?.user as SocketUser | undefined;
        if (u && u.id === user.id && s.id !== socket.id) {
          console.log('Skip disconnect: user has another active socket:', user.username);
          return;
        }
      }
      gameManager.handleDisconnect(user.id);
    }, 1000);
  });
});

// Одноразовая миграция: проставить publicId старым юзерам без него (см. 10.8)
migratePublicIds();

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});

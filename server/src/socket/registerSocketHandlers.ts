import type { Server } from 'socket.io';
import type { GameManager } from '../game/GameManager.js';
import { verifyToken } from '../auth/verifyToken.js';
import { isSessionValid } from '../auth/sessionStore.js';
import { forceDisconnectOtherSessions, hasOtherActiveSocket } from './sessionManager.js';
import type { SocketUser } from './types.js';
import { SOCKET_EVENTS } from '@poker-room/shared';
import { isEmojiOwned } from '../game/inventoryService.js';
import { consumeQuota } from '../middleware/rateLimit.js';

// Emoji-реакции: список разрешённых + кулдаун 2 сек на пользователя (см. roadmap 10.12).
// Сверх базового набора — эксклюзивные эмодзи из магазина косметики (ROADMAP §10.21.12):
// isEmojiOwned проверяет владение НА СЕРВЕРЕ (не просто UI-гейт в палитре) — иначе можно
// подделать сокет-пакет и слать премиум-эмодзи бесплатно.
const ROOM_CREATE_MAX = 5;              // столов на аккаунт
const ROOM_CREATE_WINDOW_MS = 5 * 60_000; // за 5 минут

const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🤔', '😎', '🤑', '😠', '🎲'];
const EMOJI_COOLDOWN_MS = 2000;
// userId → время последней реакции. Запись живёт ровно кулдаун, дальше бесполезна, поэтому
// протухшие чистятся ленивым проходом (не чаще раза в EMOJI_PRUNE_INTERVAL_MS): без этого карта
// росла бы вечно — по записи на каждого игрока, когда-либо отправившего эмодзи.
const lastEmojiAt = new Map<string, number>();
const EMOJI_PRUNE_INTERVAL_MS = 60_000;
let lastEmojiPruneAt = 0;

// Убрать записи, по которым кулдаун уже истёк (они ничего не ограничивают).
function pruneEmojiCooldowns(now: number): void {
  if (now - lastEmojiPruneAt < EMOJI_PRUNE_INTERVAL_MS) return;
  lastEmojiPruneAt = now;
  lastEmojiAt.forEach((t, userId) => {
    if (now - t >= EMOJI_COOLDOWN_MS) lastEmojiAt.delete(userId);
  });
}

// Весь socket-слой: JWT-handshake + single-session + обработчики событий комнаты.
// Вынесено из index.ts (ROADMAP §9.3-C).
export function registerSocketHandlers(io: Server, gameManager: GameManager): void {
  // Сокет-middleware: проверка JWT + single-session
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const decoded = verifyToken<SocketUser>(token);
    if (!decoded) {
      return next(new Error(token ? 'Invalid token' : 'No token'));
    }
    // sid отсутствует у токенов, выпущенных до «Мои устройства» (§10.15) — таким даём пройти.
    // Если sid есть — сессия должна существовать в sessions.json (иначе её отозвали).
    if (decoded.sid && !isSessionValid(decoded.sid)) {
      return next(new Error('Session revoked'));
    }
    socket.data.user = decoded;
    // Single-session: отрубаем старые сокеты этого юзера (см. sessionManager).
    forceDisconnectOtherSessions(io, decoded.id);
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    console.log('User connected:', socket.id, user.username);

    // Anti-collusion (доделка §10.6): IP из handshake + device-id, который клиент генерирует
    // и хранит в localStorage (см. client/src/lib/deviceId.ts), присылает в auth при подключении.
    const networkInfo = { ip: socket.handshake.address, deviceId: String(socket.handshake.auth?.deviceId ?? '') };

    // Мультитейблинг: восстановить столы, где игрок ещё сидит (sit-out), на (ре)коннекте/reload.
    // Сервер сам вернёт сокет в комнаты + разошлёт состояние → пилюли восстановятся. Не пере-сажает.
    gameManager.reconnectUserTables(user.id, socket);

    // Лимит времени сессии (ROADMAP §11.2) — один отсчёт на userId, не на socketId.
    gameManager.trackUserConnected(user.id);

    socket.on(SOCKET_EVENTS.LOBBY_SUBSCRIBE, () => {
      socket.join('lobby');
      socket.emit(SOCKET_EVENTS.ROOM_LIST, gameManager.getRoomList());
    });

    socket.on(SOCKET_EVENTS.LOBBY_UNSUBSCRIBE, () => {
      socket.leave('lobby');
    });

    socket.on(SOCKET_EVENTS.CREATE_ROOM, (data: { name: string; description?: string; smallBlind: number; bigBlind: number; maxPlayers: number; password?: string; turnDurationSec?: number; buyInMinBb?: number; buyInMaxBb?: number; timebank?: { enabled: boolean; startSec: number; bonusSec: number; bonusEveryHands: number; capSec: number }; sitOutTimeoutMin?: number; waitlistDelayMin?: number; format?: 'nlh' | 'shortdeck'; rake?: { percent: number; capBb: number }; ante?: number; sessionDurationHours?: number; autoStartPlayers?: number; pinned?: boolean; autoExtendSession?: boolean; clubId?: string; straddleEnabled?: boolean; bombPotEnabled?: boolean; doubleBoardEnabled?: boolean; rimtEnabled?: boolean; evCashoutEnabled?: boolean; noTurnNoShowEnabled?: boolean }) => {
      if (!data || typeof data.name !== 'string') return;
      // Лимит на создание столов (аудит 2026-09-08): без него авторизованный игрок мог в цикле
      // залить рум столами — рост памяти, файла rooms.json и широковещательных рассылок в лобби.
      // Квота по userId, а не по IP: у игрока с несколькими вкладками IP один, ограничивать надо аккаунт.
      const quota = consumeQuota(`create-room:${user.id}`, ROOM_CREATE_MAX, ROOM_CREATE_WINDOW_MS);
      if (!quota.ok) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: `Слишком много столов подряд. Повторите через ${quota.retryAfterSec} с.` });
        return;
      }
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
          sitOutTimeoutMin: data.sitOutTimeoutMin,
          waitlistDelayMin: data.waitlistDelayMin,
          format: data.format,
          // per-table опции из модалки (§10.6) — раньше терялись в этом обработчике (фикс 2026-06-13)
          rake: data.rake,
          ante: data.ante,
          sessionDurationHours: data.sessionDurationHours,
          autoStartPlayers: data.autoStartPlayers,
          autoExtendSession: data.autoExtendSession,
          // «Закрепить сверху» — только админ; роль проверяем здесь, не доверяем клиенту (§0.13)
          pinned: user.role === 'admin' ? data.pinned : false,
          clubId: data.clubId,
          straddleEnabled: data.straddleEnabled,
          bombPotEnabled: data.bombPotEnabled,
          doubleBoardEnabled: data.doubleBoardEnabled,
          rimtEnabled: data.rimtEnabled,
          evCashoutEnabled: data.evCashoutEnabled,
          noTurnNoShowEnabled: data.noTurnNoShowEnabled,
        },
        user.username,
        user.id,
      );
      if ('error' in result) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: result.error });
        return;
      }
      // Создатель автоматически входит в свою комнату с максимальным доступным бай-ином.
      // addPlayer без buyInAmount сам возьмёт min(bankroll, bigBlind*maxBb).
      socket.join(result.roomId);
      const added = gameManager.addPlayer(result.roomId, user.id, socket.id, user.username, undefined, networkInfo);
      if (!added) {
        // Чаще всего — банкролл меньше минимального бай-ина; откатываем созданную комнату
        gameManager.adminForceCloseRoom(result.roomId);
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Недостаточно фишек для входа за стол. Обратитесь к админу.' });
        return;
      }
      socket.emit(SOCKET_EVENTS.ROOM_CREATED, { roomId: result.roomId });
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      socket.leave(data.roomId);
      gameManager.removePlayer(data.roomId, user.id);
    });

    socket.on(SOCKET_EVENTS.REQUEST_GAME_STATE, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      // Базовая проверка — комната существует и юзер в ней
      const baseState = gameManager.getGameState(data.roomId);
      if (!baseState) {
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'not-found' });
        return;
      }
      const isInRoom = baseState.players.some(p => p.id === user.id);
      if (!isInRoom) {
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'not-found' });
        return;
      }
      socket.join(data.roomId);
      gameManager.addPlayer(data.roomId, user.id, socket.id, user.username);
      // Персональный state с учётом viewer + admin-peek (если включён)
      const withPeek = gameManager.isAdminPeekUser(user.id);
      const personalState = gameManager.getGameState(data.roomId, user.id, withPeek);
      if (personalState) socket.emit(SOCKET_EVENTS.GAME_UPDATE, personalState);
      const endsAt = gameManager.getCountdownEndsAt(data.roomId);
      socket.emit(SOCKET_EVENTS.START_COUNTDOWN, { endsAt });
    });

    // Наблюдатель: войти в комнату БЕЗ посадки (можно даже на полный стол). Сокет
    // присоединяется к socket.io-комнате, в room.players не добавляется → broadcastGameState
    // шлёт ему base-state без карт соперников (§0.1). Админ-наблюдатель видит открытые карты —
    // peek включается автоматически (решение пользователя 2026-06-12). Реального места не занимает,
    // на счётчики/автостарт/раздачу не влияет (он не игрок).
    socket.on(SOCKET_EVENTS.OBSERVE_ROOM, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      const baseState = gameManager.getGameState(data.roomId);
      if (!baseState) {
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'not-found' });
        return;
      }
      socket.join(data.roomId);
      gameManager.addObserver(data.roomId, socket.id, user.id, user.username);
      if (user.role === 'admin') gameManager.setAdminPeek(user.id, true);
      const withPeek = gameManager.isAdminPeekUser(user.id);
      // viewer=user.id: наблюдатель не среди игроков → своих карт нет; админ-peek отдаёт все.
      const personalState = gameManager.getGameState(data.roomId, user.id, withPeek);
      if (personalState) socket.emit(SOCKET_EVENTS.GAME_UPDATE, personalState);
      const endsAt = gameManager.getCountdownEndsAt(data.roomId);
      socket.emit(SOCKET_EVENTS.START_COUNTDOWN, { endsAt });
    });

    // Admin-peek: «глаз админа» — карты всех игроков + следующие 5 карт колоды.
    // Серверная проверка роли — обязательна (нельзя доверять клиенту).
    socket.on(SOCKET_EVENTS.ADMIN_PEEK_TOGGLE, (data: { enabled: boolean; roomId?: string }) => {
      if (user.role !== 'admin') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Только для админа' });
        return;
      }
      gameManager.setAdminPeek(user.id, !!data?.enabled);
      // Сразу пушим этому сокету свежий state — чтобы переключение мгновенно отразилось в UI
      if (data?.roomId) {
        const withPeek = gameManager.isAdminPeekUser(user.id);
        const state = gameManager.getGameState(data.roomId, user.id, withPeek);
        if (state) socket.emit(SOCKET_EVENTS.GAME_UPDATE, state);
      }
    });

    socket.on(SOCKET_EVENTS.JOIN_ROOM, (data: { roomId: string; password?: string; buyInAmount?: number }) => {
      if (!data || typeof data.roomId !== 'string') return;
      const denyReason = gameManager.canJoinRoom(data.roomId, user.id, data.password, data.buyInAmount, networkInfo);
      if (denyReason) {
        // Для временного кика добавляем остаток в секундах — клиент покажет «через N мин».
        const retryAfterSec = denyReason === 'on-cooldown'
          ? Math.ceil(gameManager.kickCooldownRemainingMs(data.roomId, user.id) / 1000)
          : undefined;
        // Без рэтхола: показываем конкретную сумму, иначе игрок не знает, сколько заносить.
        const requiredBuyIn = denyReason === 'rathole-min-buyin'
          ? gameManager.ratholeRequiredFor(data.roomId, user.id)
          : undefined;
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: denyReason, retryAfterSec, requiredBuyIn });
        return;
      }
      socket.join(data.roomId);
      const added = gameManager.addPlayer(data.roomId, user.id, socket.id, user.username, data.buyInAmount, networkInfo);
      if (!added) {
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'invalid-buyin' });
        return;
      }
      socket.emit(SOCKET_EVENTS.ROOM_JOINED, { roomId: data.roomId });
    });

    // Встать в очередь на полный стол (авто-посадка при освобождении места через задержку стола).
    socket.on(SOCKET_EVENTS.JOIN_WAITLIST, (data: { roomId: string; password?: string; buyInAmount?: number }) => {
      if (!data || typeof data.roomId !== 'string') return;
      const result = gameManager.joinWaitlist(data.roomId, user.id, user.username, socket, data.password, data.buyInAmount);
      if ('error' in result) {
        socket.emit(SOCKET_EVENTS.JOIN_DENIED, { reason: result.error });
        return;
      }
      if ('seated' in result) {
        // Место освободилось к моменту запроса — сели сразу
        socket.emit(SOCKET_EVENTS.ROOM_JOINED, { roomId: data.roomId });
      }
      // queued — обратная связь через обновлённый roomList (карточка покажет позицию)
    });

    socket.on(SOCKET_EVENTS.LEAVE_WAITLIST, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.leaveWaitlist(data.roomId, user.id);
    });

    socket.on(SOCKET_EVENTS.PLAYER_ACTION, (data: { roomId: string; action: string; amount?: number }) => {
      if (!data || typeof data.roomId !== 'string' || typeof data.action !== 'string') return;
      // amount не проверяется рантаймом socket.io (TS-тип — только компайл-тайм): нечисловое
      // значение (строка/объект) иначе попадёт в room.currentBet и сломает арифметику ниже
      // по стеку (minRaiseTo делает currentBet + lastRaiseSize — конкатенация вместо сложения).
      const amount = typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : undefined;
      gameManager.handlePlayerAction(data.roomId, user.id, data.action, amount);
    });

    // Авто-докупка стека: клиент присылает свою преференцию (живёт в localStorage), сервер
    // применяет её между раздачами в cleanupHand. Санитизация диапазона — в setAutoTopUp.
    socket.on(SOCKET_EVENTS.SET_AUTO_TOPUP, (data: { roomId: string; enabled: boolean; thresholdBb: number; targetBb: number }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.setAutoTopUp(data.roomId, user.id, {
        enabled: !!data.enabled,
        thresholdBb: Number(data.thresholdBb),
        targetBb: Number(data.targetBb),
      });
    });

    // Тумблер «Подсказка комбинации/шансов» (настройки игры). Сервер считает equity только
    // для включивших → шлёт персонально (своё место, без утечки чужих карт, §0.1).
    socket.on(SOCKET_EVENTS.SET_HAND_HINT, (data: { roomId: string; enabled: boolean }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.setHandHint(data.roomId, user.id, !!data.enabled);
    });

    // Добровольный показ своей карты после раздачи (тап по карте в окне showdown). Видно всем.
    socket.on(SOCKET_EVENTS.SHOW_CARD, (data: { roomId: string; index: number }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.showCard(data.roomId, user.id, Number(data.index));
    });

    // Rabbit Hunting (§10.12, платная фича): заплатить и увидеть карты, которые пришли бы.
    socket.on(SOCKET_EVENTS.RABBIT_HUNT, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.requestRabbitHunt(data.roomId, user.id);
    });

    socket.on(SOCKET_EVENTS.START_GAME, (data: { roomId: string }) => {
      if (!data || typeof data.roomId !== 'string') return;
      gameManager.startGame(data.roomId);
    });

    // Emoji-реакция: клиент шлёт {roomId, emoji}; сервер валидирует и broadcast'ит всем в комнате.
    // Rate-limit: 1 реакция в EMOJI_COOLDOWN_MS на пользователя.
    socket.on(SOCKET_EVENTS.SEND_EMOJI, (data: { roomId: string; emoji: string }) => {
      if (!data || typeof data.roomId !== 'string' || typeof data.emoji !== 'string') return;
      if (!ALLOWED_EMOJI.includes(data.emoji) && !isEmojiOwned(user.id, data.emoji)) return;
      if (!socket.rooms.has(data.roomId)) return;
      const now = Date.now();
      const last = lastEmojiAt.get(user.id) || 0;
      if (now - last < EMOJI_COOLDOWN_MS) return;
      lastEmojiAt.set(user.id, now);
      pruneEmojiCooldowns(now);
      io.to(data.roomId).emit(SOCKET_EVENTS.EMOJI_BROADCAST, { playerId: user.id, emoji: data.emoji });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id, user.username);
      // Admin-peek привязан к userId (не socketId) — намеренно НЕ снимаем на disconnect,
      // иначе сворачивание ТГ (пересоздание сокета) молча гасило peek (баг 2026-08-27).
      gameManager.removeObserverSocket(socket.id);
      // Защита от гонки с single-session middleware: при refresh старый сокет получает
      // disconnect, но новый сокет того же юзера уже подключился (или вот-вот подключится).
      // Откладываем handleDisconnect и пропускаем его, если в io есть другой активный сокет
      // того же user.id. Иначе игрока бы удалили из комнаты прямо при refresh.
      setTimeout(() => {
        if (hasOtherActiveSocket(io, user.id, socket.id)) {
          console.log('Skip disconnect: user has another active socket:', user.username);
          return;
        }
        gameManager.handleDisconnect(user.id);
        gameManager.trackUserDisconnected(user.id);
      }, 1000);
    });
  });
}

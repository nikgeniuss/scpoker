import type { Server } from 'socket.io';
import type { GameManager } from '../game/GameManager.js';
import { verifyToken } from '../auth/verifyToken.js';
import { forceDisconnectOtherSessions, hasOtherActiveSocket } from './sessionManager.js';
import type { SocketUser } from './types.js';

// Emoji-реакции: список разрешённых + кулдаун 2 сек на пользователя (см. roadmap 10.12)
const ALLOWED_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🤔', '😎', '🤑', '😠', '🎲'];
const EMOJI_COOLDOWN_MS = 2000;
const lastEmojiAt = new Map<string, number>();

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
    socket.data.user = decoded;
    // Single-session: отрубаем старые сокеты этого юзера (см. sessionManager).
    forceDisconnectOtherSessions(io, decoded.id);
    next();
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
        if (hasOtherActiveSocket(io, user.id, socket.id)) {
          console.log('Skip disconnect: user has another active socket:', user.username);
          return;
        }
        gameManager.handleDisconnect(user.id);
      }, 1000);
    });
  });
}

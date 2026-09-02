import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SOCKET_EVENTS } from '@poker-room/shared';

// Анти-чит эксклюзивных эмодзи (ROADMAP §10.21.12): SEND_EMOJI обязан проверять владение
// НЕ базовыми эмодзи на СЕРВЕРЕ (isEmojiOwned из inventoryService) — иначе можно подделать
// сокет-пакет и слать премиум-эмодзи бесплатно, минуя UI-гейт в EmojiPalette.

vi.mock('../../auth/verifyToken.js', () => ({
  verifyToken: () => ({ id: 'U1', username: 'alice', role: 'player' }),
}));
vi.mock('../../auth/sessionStore.js', () => ({
  isSessionValid: () => true,
}));
vi.mock('../sessionManager.js', () => ({
  forceDisconnectOtherSessions: () => {},
  hasOtherActiveSocket: () => false,
}));

const isEmojiOwnedMock = vi.fn();
vi.mock('../../game/inventoryService.js', () => ({
  isEmojiOwned: (userId: string, emoji: string) => isEmojiOwnedMock(userId, emoji),
}));

import { registerSocketHandlers } from '../registerSocketHandlers.js';

type Handler = (data: unknown) => void;

function createFakeIoAndSocket() {
  const middlewares: Array<(socket: unknown, next: (err?: Error) => void) => void> = [];
  const handlers: Record<string, Handler> = {};
  const roomEmit = vi.fn();
  const socket = {
    id: 'sock-1',
    handshake: { auth: { token: 'x' }, address: '127.0.0.1' },
    data: {} as { user?: unknown },
    rooms: new Set<string>(['r1']),
    join(r: string) { this.rooms.add(r); },
    leave(r: string) { this.rooms.delete(r); },
    emit: vi.fn(),
    on(event: string, cb: Handler) { handlers[event] = cb; },
  };
  const io = {
    use(fn: (socket: unknown, next: (err?: Error) => void) => void) { middlewares.push(fn); },
    on(event: string, cb: (socket: unknown) => void) {
      if (event !== 'connection') return;
      for (const mw of middlewares) mw(socket, () => {});
      cb(socket);
    },
    to: vi.fn(() => ({ emit: roomEmit })),
  };
  return { io, socket, handlers, roomEmit };
}

function createGameManagerStub() {
  return {
    reconnectUserTables: vi.fn(),
    trackUserConnected: vi.fn(),
    trackUserDisconnected: vi.fn(),
    getRoomList: vi.fn(() => []),
    createRoom: vi.fn(() => ({ roomId: 'r1' })),
    addPlayer: vi.fn(() => true),
    adminForceCloseRoom: vi.fn(),
    removePlayer: vi.fn(),
    getGameState: vi.fn(() => null),
    isAdminPeekUser: vi.fn(() => false),
    getCountdownEndsAt: vi.fn(() => null),
    addObserver: vi.fn(),
    setAdminPeek: vi.fn(),
    canJoinRoom: vi.fn(() => null),
    kickCooldownRemainingMs: vi.fn(() => 0),
    joinWaitlist: vi.fn(() => ({ queued: true })),
    leaveWaitlist: vi.fn(),
    handlePlayerAction: vi.fn(),
    setAutoTopUp: vi.fn(),
    setHandHint: vi.fn(),
    showCard: vi.fn(),
    requestRabbitHunt: vi.fn(),
    startGame: vi.fn(),
    removeObserverSocket: vi.fn(),
    handleDisconnect: vi.fn(),
  };
}

describe('registerSocketHandlers — SEND_EMOJI анти-чит эксклюзивных эмодзи', () => {
  let handlers: Record<string, Handler>;
  let roomEmit: ReturnType<typeof vi.fn>;
  // lastEmojiAt (2с кулдаун на отправку) — module-level state в registerSocketHandlers.ts,
  // НЕ сбрасывается между тестами (реальный, немокнутый модуль). Разносим тесты по времени
  // через fake timers, иначе второй SEND_EMOJI подряд у одного userId 'U1' молча блокируется
  // кулдауном ещё до проверки владения — ложный failure, не связанный с анти-читом.
  let testTime = 1_700_000_000_000;

  beforeEach(() => {
    isEmojiOwnedMock.mockReset();
    vi.useFakeTimers();
    testTime += 10_000;
    vi.setSystemTime(testTime);
    const fake = createFakeIoAndSocket();
    handlers = fake.handlers;
    roomEmit = fake.roomEmit;
    const gm = createGameManagerStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSocketHandlers(fake.io as any, gm as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('базовый эмодзи из ALLOWED_EMOJI проходит без проверки владения', () => {
    handlers[SOCKET_EVENTS.SEND_EMOJI]({ roomId: 'r1', emoji: '🔥' });
    expect(roomEmit).toHaveBeenCalledWith(SOCKET_EVENTS.EMOJI_BROADCAST, { playerId: 'U1', emoji: '🔥' });
    expect(isEmojiOwnedMock).not.toHaveBeenCalled();
  });

  it('эксклюзивный эмодзи БЕЗ владения — не broadcast (payload не долетает до других игроков)', () => {
    isEmojiOwnedMock.mockReturnValue(false);
    handlers[SOCKET_EVENTS.SEND_EMOJI]({ roomId: 'r1', emoji: '🦈' });
    expect(isEmojiOwnedMock).toHaveBeenCalledWith('U1', '🦈');
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('эксклюзивный эмодзи С владением — broadcast проходит', () => {
    isEmojiOwnedMock.mockReturnValue(true);
    handlers[SOCKET_EVENTS.SEND_EMOJI]({ roomId: 'r1', emoji: '🦈' });
    expect(roomEmit).toHaveBeenCalledWith(SOCKET_EVENTS.EMOJI_BROADCAST, { playerId: 'U1', emoji: '🦈' });
  });
});

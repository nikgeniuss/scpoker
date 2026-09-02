import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SOCKET_EVENTS } from '@poker-room/shared';

// Регресс-тест на найденную 2026-08-23 критическую уязвимость: обработчики socket-событий
// читали поля payload (data.roomId/data.action/...) без проверки, что data вообще существует.
// socket.io НЕ ловит исключения, брошенные внутри socket.on()-колбэка (проверено изолированным
// репро на реальном socket.io@4.8.3) — они долетают до process-level uncaughtException и, при
// отсутствии глобального хендлера (его в index.ts нет), убивают весь Node-процесс. Любой
// авторизованный игрок мог положить весь покер-рум одним socket.emit('playerAction') без данных.
// Тест не поднимает реальный сервер — ловит зарегистрированные handler'ы напрямую (как
// socketManager.test.ts), и проверяет: (1) вызов с data=undefined/null не бросает исключение,
// (2) GameManager не вызывается (guard срабатывает ДО обращения к игровой логике).

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

import { registerSocketHandlers } from '../registerSocketHandlers.js';

type Handler = (data: unknown) => void;

function createFakeIoAndSocket() {
  const middlewares: Array<(socket: unknown, next: (err?: Error) => void) => void> = [];
  const handlers: Record<string, Handler> = {};
  const socket = {
    id: 'sock-1',
    handshake: { auth: { token: 'x' }, address: '127.0.0.1' },
    data: {} as { user?: unknown },
    rooms: new Set<string>(),
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
    to() { return { emit: vi.fn() }; },
  };
  return { io, socket, handlers };
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

// Событие → (gm-метод, который НЕ должен вызваться при мусорном payload)
const VULNERABLE_EVENTS: Array<[string, keyof ReturnType<typeof createGameManagerStub>]> = [
  [SOCKET_EVENTS.CREATE_ROOM, 'createRoom'],
  [SOCKET_EVENTS.LEAVE_ROOM, 'removePlayer'],
  [SOCKET_EVENTS.REQUEST_GAME_STATE, 'addPlayer'],
  [SOCKET_EVENTS.OBSERVE_ROOM, 'addObserver'],
  [SOCKET_EVENTS.JOIN_ROOM, 'canJoinRoom'],
  [SOCKET_EVENTS.JOIN_WAITLIST, 'joinWaitlist'],
  [SOCKET_EVENTS.LEAVE_WAITLIST, 'leaveWaitlist'],
  [SOCKET_EVENTS.PLAYER_ACTION, 'handlePlayerAction'],
  [SOCKET_EVENTS.START_GAME, 'startGame'],
];

describe('registerSocketHandlers — payload без data не роняет сервер', () => {
  let handlers: Record<string, Handler>;
  let gm: ReturnType<typeof createGameManagerStub>;

  beforeEach(() => {
    const fake = createFakeIoAndSocket();
    handlers = fake.handlers;
    gm = createGameManagerStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSocketHandlers(fake.io as any, gm as any);
  });

  for (const [event, gmMethod] of VULNERABLE_EVENTS) {
    it(`${event}: data=undefined не бросает и не доходит до GameManager.${gmMethod}`, () => {
      expect(() => handlers[event](undefined)).not.toThrow();
      expect(gm[gmMethod]).not.toHaveBeenCalled();
    });

    it(`${event}: data=null не бросает и не доходит до GameManager.${gmMethod}`, () => {
      expect(() => handlers[event](null)).not.toThrow();
      expect(gm[gmMethod]).not.toHaveBeenCalled();
    });
  }

  it('playerAction: amount строкой санитизируется в undefined (не долетает как string до handlePlayerAction)', () => {
    handlers[SOCKET_EVENTS.PLAYER_ACTION]({ roomId: 'r1', action: 'raise', amount: '9999' });
    expect(gm.handlePlayerAction).toHaveBeenCalledWith('r1', 'U1', 'raise', undefined);
  });

  it('playerAction: валидный числовой amount проходит как есть', () => {
    handlers[SOCKET_EVENTS.PLAYER_ACTION]({ roomId: 'r1', action: 'raise', amount: 200 });
    expect(gm.handlePlayerAction).toHaveBeenCalledWith('r1', 'U1', 'raise', 200);
  });
});

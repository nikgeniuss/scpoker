// Минимальный двойник socket.io Server для тестов GameManager.
// Реализует ровно те поверхности, которые GameManager реально использует:
//   - io.to(target).emit(event, payload)            (broadcast в комнату ИЛИ конкретному сокету)
//   - io.sockets.sockets                             Map<socketId, MockSocket>
//   - io.sockets.adapter.rooms                       Map<roomId, Set<socketId>>
//   - socket.data.user, socket.emit, socket.leave
//
// Не пытается имитировать сетевой transport, namespaces, middleware и т.п. — только
// surface, нужный для assertion'ов в тестах.

export interface EmittedEvent {
  target: string;
  event: string;
  payload: unknown;
}

export interface SocketEmittedEvent {
  event: string;
  payload: unknown;
}

export interface MockSocket {
  id: string;
  data: { user?: { id: string; username: string } };
  // Тестовый API: эмиты, доставленные именно этому сокету
  emitted: SocketEmittedEvent[];
  // socket.io API:
  emit(event: string, payload?: unknown): void;
  join(roomId: string): void;
  leave(roomId: string): void;
  rooms: Set<string>;
}

export interface MockIo {
  // socket.io-совместимые поля:
  to(target: string): { emit(event: string, payload?: unknown): void };
  sockets: {
    sockets: Map<string, MockSocket>;
    adapter: { rooms: Map<string, Set<string>> };
  };
  // Тестовое API (не существует в реальном Server):
  /** Все эмиты через io.to(...).emit(...) */
  emitted: EmittedEvent[];
  /** Создать сокет для пользователя и, опционально, сразу подписать на комнату. */
  addSocket(userId: string, username: string, roomId?: string): MockSocket;
  /** Удалить сокет (имитация disconnect на сетевом уровне). */
  removeSocket(socketId: string): void;
  /** Добавить сокет в комнату (имитация socket.join(roomId)). */
  joinRoom(socketId: string, roomId: string): void;
  /** Сбросить всё состояние. Вызвать в beforeEach. */
  reset(): void;
}

export function createMockIo(): MockIo {
  const emitted: EmittedEvent[] = [];
  const sockets = new Map<string, MockSocket>();
  const adapterRooms = new Map<string, Set<string>>();
  let counter = 0;

  function deliver(target: string, event: string, payload: unknown): void {
    // 1) Если target — известная комната, доставить всем её сокетам
    const room = adapterRooms.get(target);
    if (room) {
      for (const sid of room) {
        const sock = sockets.get(sid);
        if (sock) sock.emitted.push({ event, payload });
      }
    }
    // 2) Если target — конкретный сокет, доставить ему
    const direct = sockets.get(target);
    if (direct) {
      direct.emitted.push({ event, payload });
    }
  }

  const io: MockIo = {
    to(target: string) {
      return {
        emit(event: string, payload?: unknown) {
          emitted.push({ target, event, payload });
          deliver(target, event, payload);
        },
      };
    },
    sockets: {
      sockets,
      adapter: { rooms: adapterRooms },
    },
    emitted,
    addSocket(userId, username, roomId) {
      const id = 'sock-' + (++counter);
      const rooms = new Set<string>();
      const socketEmitted: SocketEmittedEvent[] = [];
      const sock: MockSocket = {
        id,
        data: { user: { id: userId, username } },
        emitted: socketEmitted,
        emit(event, payload) {
          socketEmitted.push({ event, payload });
        },
        join(rid) {
          rooms.add(rid);
          if (!adapterRooms.has(rid)) adapterRooms.set(rid, new Set());
          adapterRooms.get(rid)!.add(id);
        },
        leave(rid) {
          rooms.delete(rid);
          adapterRooms.get(rid)?.delete(id);
        },
        rooms,
      };
      sockets.set(id, sock);
      if (roomId) io.joinRoom(id, roomId);
      return sock;
    },
    removeSocket(socketId) {
      const sock = sockets.get(socketId);
      if (!sock) return;
      for (const rid of sock.rooms) {
        adapterRooms.get(rid)?.delete(socketId);
      }
      sockets.delete(socketId);
    },
    joinRoom(socketId, roomId) {
      const sock = sockets.get(socketId);
      if (!sock) return;
      sock.rooms.add(roomId);
      if (!adapterRooms.has(roomId)) adapterRooms.set(roomId, new Set());
      adapterRooms.get(roomId)!.add(socketId);
    },
    reset() {
      emitted.length = 0;
      sockets.clear();
      adapterRooms.clear();
      counter = 0;
    },
  };

  return io;
}

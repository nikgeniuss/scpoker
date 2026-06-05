import { describe, it, expect } from 'vitest';
import type { Server } from 'socket.io';
import { forceDisconnectOtherSessions, hasOtherActiveSocket } from '../sessionManager.js';

// Тест single-session логики (ROADMAP §9.3-C). Мини-мок io: только io.sockets.sockets +
// emit/disconnect на сокете (ioMock из game-тестов не реализует disconnect).
function makeIo() {
  const sockets = new Map<string, unknown>();
  const log = { disconnected: [] as string[], emitted: [] as Array<{ id: string; event: string }> };
  function addSocket(id: string, userId: string) {
    sockets.set(id, {
      id,
      data: { user: { id: userId, username: userId, role: 'player' } },
      emit: (event: string) => log.emitted.push({ id, event }),
      disconnect: () => log.disconnected.push(id),
    });
  }
  const io = { sockets: { sockets } } as unknown as Server;
  return { io, log, addSocket };
}

describe('forceDisconnectOtherSessions', () => {
  it('отрубает ВСЕ сокеты указанного юзера (emit forceDisconnect + disconnect), чужие не трогает', () => {
    const { io, log, addSocket } = makeIo();
    addSocket('a1', 'A');
    addSocket('a2', 'A');
    addSocket('b1', 'B');

    forceDisconnectOtherSessions(io, 'A');

    expect(log.disconnected.sort()).toEqual(['a1', 'a2']);
    expect(log.emitted.filter((e) => e.event === 'forceDisconnect').map((e) => e.id).sort()).toEqual(['a1', 'a2']);
    // Сокет B не тронут
    expect(log.disconnected).not.toContain('b1');
  });

  it('нет сокетов юзера → ничего не делает', () => {
    const { io, log, addSocket } = makeIo();
    addSocket('b1', 'B');
    forceDisconnectOtherSessions(io, 'A');
    expect(log.disconnected).toEqual([]);
    expect(log.emitted).toEqual([]);
  });
});

describe('hasOtherActiveSocket', () => {
  it('есть второй сокет того же юзера → true', () => {
    const { io, addSocket } = makeIo();
    addSocket('a1', 'A');
    addSocket('a2', 'A');
    expect(hasOtherActiveSocket(io, 'A', 'a1')).toBe(true);
    expect(hasOtherActiveSocket(io, 'A', 'a2')).toBe(true);
  });

  it('единственный сокет юзера (исключён) → false', () => {
    const { io, addSocket } = makeIo();
    addSocket('a1', 'A');
    addSocket('b1', 'B');
    expect(hasOtherActiveSocket(io, 'A', 'a1')).toBe(false);
  });

  it('исключённый сокет не считается своим же присутствием', () => {
    const { io, addSocket } = makeIo();
    addSocket('a1', 'A');
    // только a1 для A, исключаем a1 → других нет
    expect(hasOtherActiveSocket(io, 'A', 'a1')).toBe(false);
  });
});

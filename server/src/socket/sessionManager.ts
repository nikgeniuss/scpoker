import type { Server } from 'socket.io';
import type { SocketUser } from './types.js';

// Single-session: при новом handshake того же user.id отрубаем все его старые сокеты,
// чтобы вторая вкладка не перехватывала события у первой. Это фича (CLAUDE.md §0.6).
// Вызывается из io.use ДО завершения connection нового сокета — поэтому новый сокет
// ещё не в io.sockets.sockets и под раздачу не попадает.
export function forceDisconnectOtherSessions(io: Server, userId: string): void {
  for (const [, existing] of io.sockets.sockets) {
    const eu = existing.data?.user as SocketUser | undefined;
    if (eu && eu.id === userId) {
      existing.emit('forceDisconnect', { reason: 'another-session' });
      existing.disconnect(true);
    }
  }
}

// Есть ли у юзера другой активный сокет (кроме указанного) — защита от гонки с single-session
// при refresh: старый сокет получает disconnect, но новый того же юзера уже подключился.
export function hasOtherActiveSocket(io: Server, userId: string, exceptSocketId: string): boolean {
  for (const [, s] of io.sockets.sockets) {
    const u = s.data?.user as SocketUser | undefined;
    if (u && u.id === userId && s.id !== exceptSocketId) return true;
  }
  return false;
}

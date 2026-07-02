import { v4 as uuid } from 'uuid';
import { readJSON, writeJSON } from './storage.js';

// «Мои устройства» (ROADMAP §10.15) — реестр логинов с device/IP, отдельно от users.json.
// sid кладётся в JWT при логине; authMiddleware/socket-handshake проверяют его наличие здесь —
// удаление записи (revoke) делает токен недействительным немедленно, не дожидаясь истечения 7d.
// Старые токены (выпущенные до этой фичи) без sid — пропускаются без проверки (см. вызывающий код).

const FILE = 'sessions.json';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // = JWT expiresIn '7d' — после этого срока запись бессмысленна

export interface SessionRecord {
  sid: string;
  userId: string;
  createdAt: string; // ISO
  userAgent: string;
  ip: string;
}

function readSessions(): SessionRecord[] {
  try {
    return readJSON(FILE) as SessionRecord[];
  } catch {
    return [];
  }
}

// Записи старше TTL — JWT по ним уже протух сам по себе, чистим лениво при каждом доступе.
function pruneExpired(sessions: SessionRecord[]): SessionRecord[] {
  const cutoff = Date.now() - SESSION_TTL_MS;
  return sessions.filter((s) => new Date(s.createdAt).getTime() > cutoff);
}

// Новая запись при реальном логине (пароль/2FA-завершение/Telegram) — возвращает sid для JWT.
export function createSession(userId: string, userAgent: string, ip: string): string {
  const sessions = pruneExpired(readSessions());
  const sid = uuid();
  sessions.push({ sid, userId, createdAt: new Date().toISOString(), userAgent, ip });
  writeJSON(FILE, sessions);
  return sid;
}

// Сессия существует — вызывается на каждый authMiddleware/socket-handshake (только если в JWT есть sid).
export function isSessionValid(sid: string): boolean {
  return readSessions().some((s) => s.sid === sid);
}

// Список сессий юзера для «Мои устройства», новые сверху.
export function listSessions(userId: string): SessionRecord[] {
  const sessions = pruneExpired(readSessions());
  writeJSON(FILE, sessions); // персистим прунинг протухших
  return sessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Revoke — удаляет запись. Только владелец сессии может её отозвать.
export function revokeSession(userId: string, sid: string): boolean {
  const sessions = readSessions();
  const idx = sessions.findIndex((s) => s.sid === sid && s.userId === userId);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  writeJSON(FILE, sessions);
  return true;
}

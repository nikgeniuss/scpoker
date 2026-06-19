// Уведомления игроков («Входящие», ROADMAP §10.13). Хранилище — inbox.json (атомарно, §0.4).
// Запись растёт append-ом; per-user CAP = 200 записей (старые вытесняются).
import { readJSON, writeJSON } from '../auth/storage.js';
import { randomUUID } from 'crypto';

// Импортируем из @poker-room/shared (npm workspaces, §9.3-A).
import type { InboxNotification } from '@poker-room/shared';
export type { InboxNotification };

const FILE = 'inbox.json';
const CAP_PER_USER = 200;

function readAll(): InboxNotification[] {
  try {
    const d = readJSON(FILE) as InboxNotification[];
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// Добавить уведомление. Если у юзера уже CAP — вытеснить самое старое.
export function sendNotification(
  userId: string,
  type: InboxNotification['type'],
  text: string,
): InboxNotification {
  const all = readAll();
  const record: InboxNotification = { id: randomUUID(), userId, type, text, read: false, t: Date.now() };
  all.push(record);
  // Вытеснение: оставляем последние CAP_PER_USER для каждого затронутого юзера.
  const byUser: Record<string, InboxNotification[]> = {};
  for (const n of all) {
    (byUser[n.userId] ??= []).push(n);
  }
  const trimmed: InboxNotification[] = [];
  for (const uid of Object.keys(byUser)) {
    const arr = byUser[uid];
    trimmed.push(...(arr.length > CAP_PER_USER ? arr.slice(arr.length - CAP_PER_USER) : arr));
  }
  writeJSON(FILE, trimmed);
  return record;
}

// Последние limit уведомлений юзера (новые — сверху).
export function getNotifications(userId: string, limit = 50): InboxNotification[] {
  const all = readAll().filter(n => n.userId === userId);
  return all.slice(Math.max(0, all.length - limit)).reverse();
}

// Количество непрочитанных.
export function getUnreadCount(userId: string): number {
  return readAll().filter(n => n.userId === userId && !n.read).length;
}

// Пометить все прочитанными.
export function markAllRead(userId: string): void {
  const all = readAll();
  let changed = false;
  for (const n of all) {
    if (n.userId === userId && !n.read) { n.read = true; changed = true; }
  }
  if (changed) writeJSON(FILE, all);
}

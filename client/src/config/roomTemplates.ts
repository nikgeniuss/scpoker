import { API_URL } from './api';
import type { CreateRoomOptions } from '@poker-room/shared';

// Шаблоны создания стола — серверное хранение per-user (GET/PUT /api/templates).
// Список заменяется целиком. «Сохранить Шаблон» / удаление в CreateRoomModal.

export interface RoomTemplate {
  name: string;
  opts: CreateRoomOptions;
}

export async function fetchTemplates(token: string): Promise<RoomTemplate[]> {
  try {
    const r = await fetch(API_URL + '/templates', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? (data as RoomTemplate[]) : [];
  } catch {
    return [];
  }
}

// Заменить весь список шаблонов юзера. Возвращает нормализованный сервером список.
export async function putTemplates(token: string, templates: RoomTemplate[]): Promise<RoomTemplate[]> {
  const r = await fetch(API_URL + '/templates', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(templates),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'Не удалось сохранить шаблоны' }));
    throw new Error(err.error || 'Не удалось сохранить шаблоны');
  }
  const data = await r.json();
  return Array.isArray(data) ? (data as RoomTemplate[]) : templates;
}

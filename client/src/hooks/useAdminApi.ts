import { useMemo } from 'react';
import { API_URL } from '../config/api';

// Централизованный авторизованный fetch для админ-роутов (ROADMAP §9.3-E).
// Убирает ~12× повторений { Authorization: 'Bearer ' + token } + JSON.stringify + разбор ошибки.
// Все /admin-роуты возвращают JSON на успехе (включая { success: true }) — ответ всегда читается.
// На !ok парсим { error } из тела, иначе используем переданное errorMessage / 'Ошибка'.
export interface AdminApi {
  get: <T>(path: string, errorMessage?: string) => Promise<T>;
  put: <T>(path: string, body: unknown, errorMessage?: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, errorMessage?: string) => Promise<T>;
  patch: <T>(path: string, body: unknown, errorMessage?: string) => Promise<T>;
  del: <T>(path: string, errorMessage?: string) => Promise<T>;
}

export function useAdminApi(token: string | null): AdminApi {
  return useMemo(() => {
    const request = async <T>(
      method: string,
      path: string,
      body?: unknown,
      errorMessage?: string,
    ): Promise<T> => {
      const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch(API_URL + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: errorMessage || 'Ошибка' }));
        throw new Error(err.error || errorMessage || 'Ошибка');
      }
      return r.json() as Promise<T>;
    };

    return {
      get: <T>(path: string, errorMessage?: string) => request<T>('GET', path, undefined, errorMessage),
      put: <T>(path: string, body: unknown, errorMessage?: string) => request<T>('PUT', path, body, errorMessage),
      post: <T>(path: string, body?: unknown, errorMessage?: string) => request<T>('POST', path, body, errorMessage),
      patch: <T>(path: string, body: unknown, errorMessage?: string) => request<T>('PATCH', path, body, errorMessage),
      del: <T>(path: string, errorMessage?: string) => request<T>('DELETE', path, undefined, errorMessage),
    };
  }, [token]);
}

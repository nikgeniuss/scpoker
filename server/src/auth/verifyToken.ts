import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// Единая проверка JWT — раньше дублировалась в authMiddleware/adminMiddleware/io.use (ROADMAP §9.3-C).
// Возвращает декодированный payload или null (на отсутствие/невалидность токена).
// Различие «нет токена» vs «невалидный» вызывающий определяет сам по наличию строки токена.
export function verifyToken<T = unknown>(token: string | undefined | null): T | null {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as T;
  } catch {
    return null;
  }
}

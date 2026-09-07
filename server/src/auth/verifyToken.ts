import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// Единая проверка JWT — раньше дублировалась в authMiddleware/adminMiddleware/io.use (ROADMAP §9.3-C).
// Возвращает декодированный payload или null (на отсутствие/невалидность токена).
// Различие «нет токена» vs «невалидный» вызывающий определяет сам по наличию строки токена.
export function verifyToken<T = unknown>(token: string | undefined | null): T | null {
  if (!token) return null;
  try {
    // algorithms фиксируем явно (defense-in-depth): проверяющая сторона не должна принимать
    // токен, подписанный не тем алгоритмом, которым мы подписываем.
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as T;
  } catch {
    return null;
  }
}

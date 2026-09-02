import { Request, Response, NextFunction } from 'express';

// Простой in-memory rate-limit по IP — без внешней зависимости (проект минимизирует пакеты,
// см. totp.ts). Fixed-window: max попыток за windowMs, дальше 429 до конца окна. Один процесс,
// in-memory — не переживает рестарт и не шарится между инстансами; для одного Node-процесса
// этого рума достаточно. Защищает /login и /2fa-эндпоинты от перебора (CWE-307): без лимита
// bcrypt.compareSync (синхронный, ~60-100мс/попытку) под спамом тормозит event loop целиком —
// не только брутфорс пароля/кода, но и DoS живых столов через сторонний эндпоинт.
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function rateLimit(prefix: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);

    const key = `${prefix}:${req.ip ?? 'unknown'}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (existing.count >= max) {
      res.status(429).json({ error: 'too-many-attempts', retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) });
      return;
    }
    existing.count++;
    next();
  };
}

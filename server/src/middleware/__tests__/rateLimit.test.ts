import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from '../rateLimit.js';

// Регресс-тест на найденную 2026-08-23 проблему (CWE-307): /login и /2fa-эндпоинты не имели
// никакого ограничения попыток — перебор пароля/2FA-кода ничем не сдерживался, а синхронный
// bcrypt.compareSync под спамом дополнительно тормозил event loop для всех живых столов.

function makeReq(ip: string): Request {
  return { ip } as unknown as Request;
}

function makeRes(): { res: Response; statusCode: () => number | undefined; body: () => unknown } {
  let statusCode: number | undefined;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(payload: unknown) { body = payload; return this; },
  } as unknown as Response;
  return { res, statusCode: () => statusCode, body: () => body };
}

describe('rateLimit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('пропускает до max попыток, дальше — 429', () => {
    const limiter = rateLimit('t1', 3, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    for (let i = 0; i < 3; i++) {
      const { res, statusCode } = makeRes();
      limiter(makeReq('1.2.3.4'), res, next);
      expect(statusCode()).toBeUndefined();
    }
    expect(next).toHaveBeenCalledTimes(3);

    const { res, statusCode, body } = makeRes();
    limiter(makeReq('1.2.3.4'), res, next);
    expect(statusCode()).toBe(429);
    expect((body() as { error: string }).error).toBe('too-many-attempts');
    expect(next).toHaveBeenCalledTimes(3); // 4-я попытка next() не получила
  });

  it('окно истекло → лимит сбрасывается', () => {
    const limiter = rateLimit('t2', 1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    limiter(makeReq('5.5.5.5'), makeRes().res, next);
    const blocked = makeRes();
    limiter(makeReq('5.5.5.5'), blocked.res, next);
    expect(blocked.statusCode()).toBe(429);

    vi.advanceTimersByTime(60_001);

    const afterWindow = makeRes();
    limiter(makeReq('5.5.5.5'), afterWindow.res, next);
    expect(afterWindow.statusCode()).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('разные IP не делят один лимит', () => {
    const limiter = rateLimit('t3', 1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    limiter(makeReq('9.9.9.9'), makeRes().res, next);
    const other = makeRes();
    limiter(makeReq('8.8.8.8'), other.res, next);
    expect(other.statusCode()).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('разные лимитеры (prefix) не делят состояние даже для одного IP', () => {
    const loginLimiter = rateLimit('login-test', 1, 60_000);
    const otherLimiter = rateLimit('other-test', 1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    loginLimiter(makeReq('7.7.7.7'), makeRes().res, next);
    const other = makeRes();
    otherLimiter(makeReq('7.7.7.7'), other.res, next);
    expect(other.statusCode()).toBeUndefined();
  });
});

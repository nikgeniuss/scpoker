import { describe, it, expect } from 'vitest';
import { planRetry, BASE_RETRY_MS, MAX_RETRY_MS } from '../pollBackoff.js';
import { TelegramApiError } from '../telegramApi.js';

// Пауза и шумность лога после сбоя getUpdates (ROADMAP §9.2). До этого на любую ошибку
// ждали ровно 5 секунд и печатали console.error — retry_after от Telegram терялся.

const tgError = (code: number | undefined, description: string, retryAfter?: number) =>
  new TelegramApiError('getUpdates', code, description, retryAfter);

describe('planRetry — retry_after от Telegram', () => {
  it('429 с retry_after ждёт ровно столько, сколько просит Telegram', () => {
    const plan = planRetry(tgError(429, 'Too Many Requests: retry after 12', 12), 1);
    expect(plan).toMatchObject({ delayMs: 12_000, reason: 'retry-after', log: 'warn' });
  });

  it('большой retry_after не срезается потолком экспоненты', () => {
    expect(planRetry(tgError(429, 'Too Many Requests', 300), 1).delayMs).toBe(300_000);
  });

  it('retry_after меньше базовой паузы не даёт долбить чаще базы', () => {
    expect(planRetry(tgError(429, 'Too Many Requests', 0), 1).delayMs).toBe(BASE_RETRY_MS);
  });

  it('429 без retry_after — обычный транзиент по экспоненте', () => {
    expect(planRetry(tgError(429, 'Too Many Requests'), 3)).toMatchObject({ delayMs: 4_000, reason: 'transient' });
  });
});

describe('planRetry — экспоненциальный backoff', () => {
  it('пауза удваивается с каждым сбоем подряд', () => {
    const delays = [1, 2, 3, 4].map((n) => planRetry(tgError(502, 'Bad Gateway'), n).delayMs);
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it('пауза упирается в потолок и не растёт бесконечно', () => {
    expect(planRetry(tgError(502, 'Bad Gateway'), 20).delayMs).toBe(MAX_RETRY_MS);
  });

  it('первый сбой (счётчик сброшен успехом) ждёт базовую паузу', () => {
    expect(planRetry(tgError(502, 'Bad Gateway'), 1).delayMs).toBe(BASE_RETRY_MS);
  });
});

describe('planRetry — шумность лога', () => {
  it('Bad Gateway виден на первом сбое, но не на каждом следующем', () => {
    expect(planRetry(tgError(502, 'Bad Gateway'), 1).log).toBe('warn');
    expect(planRetry(tgError(502, 'Bad Gateway'), 2).log).toBe('silent');
    expect(planRetry(tgError(504, 'Gateway Timeout'), 3).log).toBe('silent');
  });

  it('при затяжной недоступности напоминает о себе каждый пятый раз', () => {
    expect(planRetry(tgError(502, 'Bad Gateway'), 5).log).toBe('warn');
    expect(planRetry(tgError(502, 'Bad Gateway'), 10).log).toBe('warn');
  });

  it('нетранзиентная ошибка (неверный токен) логируется всегда как ошибка', () => {
    expect(planRetry(tgError(401, 'Unauthorized'), 2)).toMatchObject({ log: 'error', reason: 'unknown' });
    expect(planRetry(tgError(409, 'Conflict: webhook is active'), 7).log).toBe('error');
  });

  it('сетевой сбой самого fetch — транзиент, не ошибка конфигурации', () => {
    expect(planRetry(new TypeError('fetch failed'), 2)).toMatchObject({ log: 'silent', reason: 'transient' });
  });

  it('не-Error значение не роняет планировщик', () => {
    expect(planRetry('строка вместо ошибки', 1)).toMatchObject({ delayMs: BASE_RETRY_MS, reason: 'transient' });
  });
});

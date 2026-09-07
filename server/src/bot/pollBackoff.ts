import { TelegramApiError } from './telegramApi.js';

// Что делать после сбоя getUpdates — чистая функция, без таймеров и логов (их дёргает bot.ts).
// Зачем: раньше на ЛЮБУЮ ошибку long polling ждал ровно 5 секунд и печатал console.error.
// Это плохо с двух сторон: при 429 Telegram сам говорит, сколько ждать (`retry_after`) — просьбу
// игнорировали и рисковали продлить бан; а штатные обрывы long-poll (Bad Gateway / Gateway
// Timeout — 9 из 12 сбоев за всё время лога) засоряли лог как «ошибки», хотя чинить там нечего.

export const BASE_RETRY_MS = 1_000;
export const MAX_RETRY_MS = 60_000;
// Коды, при которых сбой считается транзиентным (сторона Telegram/сети, повтор решает проблему).
const TRANSIENT_CODES = [429, 500, 502, 503, 504];
// Транзиентные сбои логируем на первом и далее каждый N-й — иначе долгая недоступность Telegram
// заливает лог одинаковыми строками.
const TRANSIENT_LOG_EVERY = 5;

export interface RetryPlan {
  delayMs: number;
  log: 'error' | 'warn' | 'silent';
  reason: 'retry-after' | 'transient' | 'unknown';
}

// consecutiveFailures — сколько сбоев подряд, включая текущий (первый = 1).
export function planRetry(err: unknown, consecutiveFailures: number): RetryPlan {
  const attempt = Math.max(1, consecutiveFailures);
  const backoff = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** (attempt - 1));

  if (err instanceof TelegramApiError) {
    // Telegram явно сказал, сколько ждать — уважаем ровно эту паузу (но не меньше базовой).
    if (typeof err.retryAfterSec === 'number' && err.retryAfterSec > 0) {
      return { delayMs: Math.max(BASE_RETRY_MS, err.retryAfterSec * 1_000), log: 'warn', reason: 'retry-after' };
    }
    if (err.errorCode !== undefined && !TRANSIENT_CODES.includes(err.errorCode)) {
      // 401/409 и подобное повтором не лечатся — такое видно всегда.
      return { delayMs: backoff, log: 'error', reason: 'unknown' };
    }
  }

  // Транзиент: код из списка выше либо сетевой сбой самого fetch (не TelegramApiError).
  const noisy = attempt === 1 || attempt % TRANSIENT_LOG_EVERY === 0;
  return { delayMs: backoff, log: noisy ? 'warn' : 'silent', reason: 'transient' };
}

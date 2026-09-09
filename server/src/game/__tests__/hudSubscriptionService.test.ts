import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage } from './helpers/storage.js';
import {
  isActive,
  extend,
  pruneExpired,
  grant,
  hasActive,
  getExpiresAt,
  resetCache,
  type HudSubscriptionState,
} from '../hudSubscriptionService.js';

// Подписка на HUD соперников (ROADMAP §10.21.13). Ключевое требование — продление считается
// от даты окончания, а не от «сейчас»: иначе покупка за день до конца сжигала бы остаток.

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

beforeEach(() => {
  clearStorage();
  resetCache();
});

describe('isActive', () => {
  it('подписки нет — не активна', () => {
    expect(isActive(undefined, NOW)).toBe(false);
  });

  it('дата в будущем — активна', () => {
    expect(isActive(NOW + DAY, NOW)).toBe(true);
  });

  it('истекла — не активна', () => {
    expect(isActive(NOW - 1, NOW)).toBe(false);
  });

  it('момент окончания — уже не активна (строгое сравнение)', () => {
    expect(isActive(NOW, NOW)).toBe(false);
  });
});

describe('extend', () => {
  it('первой покупкой считает от «сейчас»', () => {
    expect(extend(undefined, NOW, 30)).toBe(NOW + 30 * DAY);
  });

  it('продление активной — от даты окончания, остаток не сгорает', () => {
    const current = NOW + 5 * DAY; // осталось 5 дней
    expect(extend(current, NOW, 30)).toBe(NOW + 35 * DAY);
  });

  it('покупка после истечения — от «сейчас», а не от старой даты', () => {
    const expired = NOW - 10 * DAY;
    expect(extend(expired, NOW, 30)).toBe(NOW + 30 * DAY);
  });
});

describe('pruneExpired', () => {
  it('выбрасывает истёкшие, оставляет активные', () => {
    const state: HudSubscriptionState = { a: NOW + DAY, b: NOW - DAY, c: NOW + 100 * DAY };
    expect(pruneExpired(state, NOW)).toEqual({ a: NOW + DAY, c: NOW + 100 * DAY });
  });
});

describe('grant / hasActive (файловая часть)', () => {
  it('выдаёт подписку и она видна как активная', () => {
    const expiresAt = grant('u1', 30, NOW);
    expect(expiresAt).toBe(NOW + 30 * DAY);
    expect(hasActive('u1', NOW + DAY)).toBe(true);
    expect(getExpiresAt('u1')).toBe(NOW + 30 * DAY);
  });

  it('второй покупкой продлевает ту же подписку, а не заводит вторую', () => {
    grant('u1', 30, NOW);
    const second = grant('u1', 30, NOW + DAY); // купил на следующий день
    expect(second).toBe(NOW + 60 * DAY); // 30 остатка + 30 новых, отсчёт от старой даты
  });

  it('чужая подписка не даёт доступа', () => {
    grant('u1', 30, NOW);
    expect(hasActive('u2', NOW)).toBe(false);
  });

  it('после истечения доступ закрывается', () => {
    grant('u1', 1, NOW);
    expect(hasActive('u1', NOW + 2 * DAY)).toBe(false);
  });

  it('запись чистит чужие истёкшие — файл не растёт вечно', () => {
    grant('old', 1, NOW - 100 * DAY); // давно истекла
    resetCache();
    grant('fresh', 30, NOW);
    expect(getExpiresAt('old')).toBeUndefined();
    expect(getExpiresAt('fresh')).toBe(NOW + 30 * DAY);
  });
});

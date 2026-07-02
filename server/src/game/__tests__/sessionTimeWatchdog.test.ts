import { describe, it, expect } from 'vitest';
import { SessionTimeWatchdog } from '../sessionTimeWatchdog.js';

const MIN = 60_000;

describe('SessionTimeWatchdog', () => {
  it('предупреждает один раз, когда сессия пересекает лимит', () => {
    const w = new SessionTimeWatchdog();
    const t0 = 1_000_000;
    w.onConnect('A', t0);

    expect(w.tick(t0 + 29 * MIN, () => 30)).toEqual([]);
    expect(w.tick(t0 + 30 * MIN, () => 30)).toEqual(['A']);
    // Повторный тик после пересечения — не предупреждает снова (warned-флаг).
    expect(w.tick(t0 + 60 * MIN, () => 30)).toEqual([]);
  });

  it('без лимита (undefined/0) — никогда не предупреждает', () => {
    const w = new SessionTimeWatchdog();
    w.onConnect('A', 0);
    expect(w.tick(10 * MIN, () => undefined)).toEqual([]);
    expect(w.tick(10 * MIN, () => 0)).toEqual([]);
  });

  it('мультитейблинг: повторный onConnect того же юзера не сбрасывает отсчёт', () => {
    const w = new SessionTimeWatchdog();
    const t0 = 0;
    w.onConnect('A', t0);
    w.onConnect('A', t0 + 10 * MIN); // второй стол открыт позже — не должен сдвинуть since
    expect(w.tick(t0 + 30 * MIN, () => 30)).toEqual(['A']);
  });

  it('onDisconnect снимает отслеживание — новая сессия начинается с нуля', () => {
    const w = new SessionTimeWatchdog();
    w.onConnect('A', 0);
    w.onDisconnect('A');
    w.onConnect('A', 100 * MIN);
    expect(w.tick(100 * MIN + 10 * MIN, () => 30)).toEqual([]);
  });

  it('несколько юзеров независимы друг от друга', () => {
    const w = new SessionTimeWatchdog();
    w.onConnect('A', 0);
    w.onConnect('B', 0);
    const crossed = w.tick(31 * MIN, (userId) => (userId === 'A' ? 30 : 60));
    expect(crossed).toEqual(['A']);
  });
});

import { describe, it, expect } from 'vitest';
import { periodRange, isLimitCrossed } from '../responsibleGamblingService.js';

describe('periodRange', () => {
  it('day — границы суток UTC + ключ по дате', () => {
    const now = new Date('2026-06-26T15:30:00.000Z');
    const r = periodRange('day', now);
    expect(r.sinceMs).toBe(new Date('2026-06-26T00:00:00.000Z').getTime());
    expect(r.untilMs).toBe(now.getTime());
    expect(r.key).toBe('d:2026-06-26');
  });

  it('week — понедельник как начало ISO-недели', () => {
    // 2026-06-26 — пятница; понедельник той недели — 2026-06-22
    const now = new Date('2026-06-26T15:30:00.000Z');
    const r = periodRange('week', now);
    expect(r.sinceMs).toBe(new Date('2026-06-22T00:00:00.000Z').getTime());
    expect(r.key).toBe('w:2026-06-22');
  });

  it('week — воскресенье относится к ПРЕДЫДУЩЕЙ неделе (понедельник-старт)', () => {
    const sunday = new Date('2026-06-28T10:00:00.000Z'); // вс
    const r = periodRange('week', sunday);
    expect(r.sinceMs).toBe(new Date('2026-06-22T00:00:00.000Z').getTime());
  });

  it('month — 1-е число месяца UTC + ключ год-месяц', () => {
    const now = new Date('2026-06-26T15:30:00.000Z');
    const r = periodRange('month', now);
    expect(r.sinceMs).toBe(new Date('2026-06-01T00:00:00.000Z').getTime());
    expect(r.key).toBe('m:2026-6');
  });

  it('разные дни одного периода дают одинаковый ключ', () => {
    const a = periodRange('month', new Date('2026-06-01T00:00:01.000Z'));
    const b = periodRange('month', new Date('2026-06-30T23:00:00.000Z'));
    expect(a.key).toBe(b.key);
  });
});

describe('isLimitCrossed', () => {
  it('false если лимит не задан/0', () => {
    expect(isLimitCrossed(1000, undefined)).toBe(false);
    expect(isLimitCrossed(1000, 0)).toBe(false);
  });

  it('true когда сумма >= лимита', () => {
    expect(isLimitCrossed(1000, 1000)).toBe(true);
    expect(isLimitCrossed(1500, 1000)).toBe(true);
  });

  it('false когда сумма меньше лимита', () => {
    expect(isLimitCrossed(999, 1000)).toBe(false);
  });
});

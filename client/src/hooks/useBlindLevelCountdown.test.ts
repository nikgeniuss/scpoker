import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBlindLevelCountdown } from './useBlindLevelCountdown';

describe('useBlindLevelCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nextLevelAt не задан — null (лестница кончилась/не турнир)', () => {
    const { result } = renderHook(() => useBlindLevelCountdown(undefined));
    expect(result.current).toBeNull();
  });

  it('форматирует остаток как m:ss и тикает раз в секунду', () => {
    const nextLevelAt = Date.now() + 90_000; // 1:30
    const { result } = renderHook(() => useBlindLevelCountdown(nextLevelAt));
    expect(result.current).toBe('1:30');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('1:29');
  });

  it('не уходит в минус после прохождения nextLevelAt — держит 0:00', () => {
    const nextLevelAt = Date.now() + 1000;
    const { result } = renderHook(() => useBlindLevelCountdown(nextLevelAt));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('0:00');
  });
});

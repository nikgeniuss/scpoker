import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHandsChart } from './useHandsChart';

// Общий хук для PokerCraft.tsx и Profile.tsx (вынесен 2026-08-30, чтобы не дублировать
// fetch + derive-логику между двумя экранами).
describe('useHandsChart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('пустой список — totalHands=0, totalPnL=0', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response)));
    const { result } = renderHook(() => useHandsChart());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalHands).toBe(0);
    expect(result.current.totalPnL).toBe(0);
  });

  it('реальные данные — totalHands = длина списка, totalPnL = последний cumPnL', async () => {
    const data = [{ t: 1, cumPnL: 100 }, { t: 2, cumPnL: -50 }, { t: 3, cumPnL: 320 }];
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)));
    const { result } = renderHook(() => useHandsChart());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalHands).toBe(3);
    expect(result.current.totalPnL).toBe(320);
    expect(result.current.data).toEqual(data);
  });

  it('обрыв сети — loading всё равно становится false, данные пустые (не виснет)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const { result } = renderHook(() => useHandsChart());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalHands).toBe(0);
    expect(result.current.totalPnL).toBe(0);
  });

  it('сервер вернул ошибку (ok:false) — трактуется как пустой список, не бросает', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'x' }) } as Response)),
    );
    const { result } = renderHook(() => useHandsChart());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalHands).toBe(0);
  });
});

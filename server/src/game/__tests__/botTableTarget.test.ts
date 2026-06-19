import { describe, it, expect } from 'vitest';
import { rollBotTableTarget } from '../BotManager.js';

describe('rollBotTableTarget — разное число ботов за столом', () => {
  it('всегда в диапазоне [2 .. max]', () => {
    for (let max = 2; max <= 8; max++) {
      for (let i = 0; i < 200; i++) {
        const t = rollBotTableTarget(max);
        expect(t).toBeGreaterThanOrEqual(2);
        expect(t).toBeLessThanOrEqual(max);
      }
    }
  });

  it('покрывает весь диапазон (не залипает на одном числе)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollBotTableTarget(6));
    // при max=6 ожидаем разброс 2..6 (минимум несколько разных значений)
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...seen)).toBe(2);
    expect(Math.max(...seen)).toBe(6);
  });

  it('крайние точки rnd → min и max', () => {
    expect(rollBotTableTarget(6, () => 0)).toBe(2);        // rnd=0 → нижняя граница
    expect(rollBotTableTarget(6, () => 0.999999)).toBe(6); // rnd→1 → верхняя граница
  });

  it('max ниже минимума зажимается до 2', () => {
    expect(rollBotTableTarget(1, () => 0)).toBe(2);
    expect(rollBotTableTarget(0, () => 0.999999)).toBe(2);
  });
});

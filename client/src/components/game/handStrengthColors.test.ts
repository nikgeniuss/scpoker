import { describe, it, expect } from 'vitest';
import { filledSegments, SEGMENTS } from './handStrengthColors';

describe('filledSegments', () => {
  it('Пара (rank 2) → 2 закрашенных сегмента, как на референсе', () => {
    expect(filledSegments(2)).toBe(2);
  });

  it('Стрит (rank 5) → 5 закрашенных сегментов, как на референсе', () => {
    expect(filledSegments(5)).toBe(5);
  });

  it('старшая карта (rank 1) → 1 сегмент', () => {
    expect(filledSegments(1)).toBe(1);
  });

  it('стрит-флеш/роял (rank 9) → все сегменты закрашены', () => {
    expect(filledSegments(9)).toBe(SEGMENTS);
  });

  it('клампит значения вне диапазона 0..9', () => {
    expect(filledSegments(0)).toBe(0);
    expect(filledSegments(-1)).toBe(0);
    expect(filledSegments(15)).toBe(SEGMENTS);
  });
});

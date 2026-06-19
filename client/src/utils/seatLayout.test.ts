import { describe, it, expect } from 'vitest';
import { buildSeatLayout } from './seatLayout';

describe('buildSeatLayout', () => {
  it('возвращает массив длиной N для каждого пресета 2..12', () => {
    for (let n = 2; n <= 12; n++) {
      expect(buildSeatLayout(n)).toHaveLength(n);
    }
  });

  it('индекс 0 — это me (bottom-center, left=50)', () => {
    for (let n = 2; n <= 12; n++) {
      expect(buildSeatLayout(n)[0].left).toBe(50);
      expect(buildSeatLayout(n)[0].top).toBeGreaterThan(80); // плашка внизу овала
    }
  });

  it('для me (dx=0) стопка фишек по горизонтали остаётся по центру', () => {
    const me = buildSeatLayout(6)[0];
    expect(me.chipLeft).toBe(50);
    expect(me.dealerLeft).toBe(50);
  });

  it('chipTop/dealerTop интерполируются к центру (48% и 30% пути)', () => {
    const me = buildSeatLayout(6)[0]; // top=85
    // chipTop = top - (top-50)*0.48
    expect(me.chipTop).toBeCloseTo(85 - (85 - 50) * 0.48, 5);
    // dealerTop = top - (top-50)*0.30
    expect(me.dealerTop).toBeCloseTo(85 - (85 - 50) * 0.3, 5);
  });

  it('для бокового места стопка смещается к центру по обеим осям', () => {
    // N=6, индекс 1 = bottom-left [5, 70]
    const seat = buildSeatLayout(6)[1];
    expect(seat.left).toBe(5);
    expect(seat.top).toBe(70);
    expect(seat.chipLeft).toBeCloseTo(5 - (5 - 50) * 0.48, 5);
    expect(seat.chipTop).toBeCloseTo(70 - (70 - 50) * 0.48, 5);
  });

  it('крайняя боковая точка унифицирована на 5/95 во всех пресетах 3..12', () => {
    for (let n = 3; n <= 12; n++) {
      const xs = buildSeatLayout(n).map((s) => s.left);
      expect(Math.min(...xs)).toBe(5);
      expect(Math.max(...xs)).toBe(95);
    }
  });

  it('неизвестное N (нет пресета) откатывается к пресету 6', () => {
    expect(buildSeatLayout(1)).toHaveLength(6);
    expect(buildSeatLayout(13)).toHaveLength(6);
    expect(buildSeatLayout(1)).toEqual(buildSeatLayout(6));
  });
});

import { describe, it, expect } from 'vitest';
import { computeBlindSeats } from './blinds';

describe('computeBlindSeats', () => {
  it('возвращает null при <2 игроках', () => {
    expect(computeBlindSeats(0, 0)).toBeNull();
    expect(computeBlindSeats(1, 0)).toBeNull();
  });

  it('heads-up (N=2): D=SB, BB=D+1', () => {
    expect(computeBlindSeats(2, 0)).toEqual({ sbIndex: 0, bbIndex: 1 });
    expect(computeBlindSeats(2, 1)).toEqual({ sbIndex: 1, bbIndex: 0 });
  });

  it('multi-way (N>2): SB=D+1, BB=D+2', () => {
    expect(computeBlindSeats(6, 0)).toEqual({ sbIndex: 1, bbIndex: 2 });
    expect(computeBlindSeats(9, 3)).toEqual({ sbIndex: 4, bbIndex: 5 });
  });

  it('multi-way с переносом через край стола', () => {
    expect(computeBlindSeats(6, 5)).toEqual({ sbIndex: 0, bbIndex: 1 });
    expect(computeBlindSeats(6, 4)).toEqual({ sbIndex: 5, bbIndex: 0 });
  });
});

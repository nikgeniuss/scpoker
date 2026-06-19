import { describe, it, expect } from 'vitest';
import { breakIntoChipGroups, denomLabel, CHIP_LADDER } from './chipDenoms';

describe('breakIntoChipGroups', () => {
  it('пустой результат для нуля и отрицательных', () => {
    expect(breakIntoChipGroups(0)).toEqual([]);
    expect(breakIntoChipGroups(-100)).toEqual([]);
  });

  it('минимальная единица — 1 цент (white)', () => {
    expect(breakIntoChipGroups(1)).toEqual([{ color: 'white', value: 1, count: 1 }]);
  });

  it('группы идут по убыванию номинала', () => {
    const groups = breakIntoChipGroups(2080874);
    const values = groups.map((g) => g.value);
    const sorted = [...values].sort((a, b) => b - a);
    expect(values).toEqual(sorted);
  });

  it('сумма групп точно равна исходной (любой банк представим точно)', () => {
    for (const amount of [26, 137, 999, 2080874, 50001]) {
      const sum = breakIntoChipGroups(amount).reduce((s, g) => s + g.value * g.count, 0);
      expect(sum).toBe(amount);
    }
  });

  it('дробную часть округляет вниз (Math.floor)', () => {
    const sum = breakIntoChipGroups(5.9).reduce((s, g) => s + g.value * g.count, 0);
    expect(sum).toBe(5);
  });

  it('использует только номиналы из лестницы', () => {
    const ladderValues = new Set(CHIP_LADDER.map((d) => d.value));
    for (const g of breakIntoChipGroups(123456)) {
      expect(ladderValues.has(g.value)).toBe(true);
    }
  });
});

describe('denomLabel', () => {
  it('центы — десятичные', () => {
    expect(denomLabel(1)).toBe('0.01');
    expect(denomLabel(5)).toBe('0.05');
    expect(denomLabel(25)).toBe('0.25');
  });

  it('доллары — целым числом', () => {
    expect(denomLabel(100)).toBe('1');
    expect(denomLabel(500)).toBe('5');
    expect(denomLabel(2500)).toBe('25');
  });

  it('тысячи — суффикс K', () => {
    expect(denomLabel(100000)).toBe('1K');
    expect(denomLabel(500000)).toBe('5K');
    expect(denomLabel(2500000)).toBe('25K');
    expect(denomLabel(150000)).toBe('1.5K');
  });
});

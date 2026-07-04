import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatMoney,
  parseMoney,
  formatChips,
  loadChipDisplay,
  saveChipDisplay,
} from './chipFormat';

describe('formatMoney (центы → строка)', () => {
  it('дробная сумма — два знака и разделитель тысяч', () => {
    expect(formatMoney(1)).toBe('0.01');
    expect(formatMoney(2080874)).toBe('20,808.74');
  });

  it('целая сумма — без ".00" (бленды/стеки/ставки, как правило целые)', () => {
    expect(formatMoney(1000)).toBe('10');
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(2000000)).toBe('20,000');
  });
});

describe('parseMoney (строка долларов → центы)', () => {
  it('парсит точку и запятую как десятичный разделитель', () => {
    expect(parseMoney('10.00')).toBe(1000);
    expect(parseMoney('10,00')).toBe(1000);
    expect(parseMoney('5')).toBe(500);
  });

  it('некорректный ввод → 0', () => {
    expect(parseMoney('abc')).toBe(0);
    expect(parseMoney('')).toBe(0);
  });
});

describe('formatChips (режим chips/bb)', () => {
  it('режим chips отдаёт деньги в центах', () => {
    expect(formatChips(1000, 200, 'chips')).toBe('10');
  });

  it('режим bb делит на большой блайнд', () => {
    expect(formatChips(1000, 200, 'bb')).toBe('5 ББ');
    expect(formatChips(1500, 1000, 'bb')).toBe('1.5 ББ');
  });

  it('режим bb с bigBlind=0 откатывается к деньгам', () => {
    expect(formatChips(1000, 0, 'bb')).toBe('10');
  });
});

describe('loadChipDisplay / saveChipDisplay (localStorage)', () => {
  beforeEach(() => localStorage.clear());

  it('дефолт — chips при пустом хранилище', () => {
    expect(loadChipDisplay()).toBe('chips');
  });

  it('сохраняет и читает bb', () => {
    saveChipDisplay('bb');
    expect(loadChipDisplay()).toBe('bb');
  });
});

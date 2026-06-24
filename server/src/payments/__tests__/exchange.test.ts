import { describe, it, expect } from 'vitest';
import { usdtRawToChips, chipsToUsdtRaw, usdtToUsdtRaw, usdtRawToUsdt } from '../exchange.js';

describe('exchange — конвертация USDT↔фишки', () => {
  const RATE = 10000; // 1 USDT = 100.00 фишек (10000 центов)

  it('usdtRawToChips: 1 USDT (1_000_000 raw) → 10000 центов фишек по дефолтному курсу', () => {
    expect(usdtRawToChips(1_000_000n, RATE)).toBe(10000);
  });

  it('usdtRawToChips: округление вниз — не кредитуем больше, чем пришло', () => {
    // 0.999999 USDT по курсу 10000 → 9999.99 центов → floor 9999
    expect(usdtRawToChips(999_999n, RATE)).toBe(9999);
  });

  it('usdtRawToChips: ноль → ноль', () => {
    expect(usdtRawToChips(0n, RATE)).toBe(0);
  });

  it('usdtRawToChips: отрицательная сумма — ошибка', () => {
    expect(() => usdtRawToChips(-1n, RATE)).toThrow();
  });

  it('chipsToUsdtRaw: 10000 центов фишек → 1 USDT (1_000_000 raw) по дефолтному курсу', () => {
    expect(chipsToUsdtRaw(10000, RATE)).toBe(1_000_000n);
  });

  it('chipsToUsdtRaw: округление вниз — не отправляем больше USDT, чем покрыто списанием', () => {
    // 9999 центов / 10000 курс * 1_000_000 = 999900 raw ровно
    expect(chipsToUsdtRaw(9999, RATE)).toBe(999_900n);
  });

  it('chipsToUsdtRaw: дробные фишки округляются вниз до целых центов перед конвертацией', () => {
    expect(chipsToUsdtRaw(100.7, RATE)).toBe(chipsToUsdtRaw(100, RATE));
  });

  it('chipsToUsdtRaw: отрицательное значение — ошибка', () => {
    expect(() => chipsToUsdtRaw(-5, RATE)).toThrow();
  });

  it('usdtToUsdtRaw/usdtRawToUsdt — round-trip для целых сумм', () => {
    const raw = usdtToUsdtRaw(12.5);
    expect(raw).toBe(12_500_000n);
    expect(usdtRawToUsdt(raw)).toBe(12.5);
  });

  it('usdtToUsdtRaw: отрицательная сумма — ошибка', () => {
    expect(() => usdtToUsdtRaw(-1)).toThrow();
  });

  it('разные курсы дают пропорционально разные суммы фишек', () => {
    const low = usdtRawToChips(1_000_000n, 5000);
    const high = usdtRawToChips(1_000_000n, 20000);
    expect(high).toBe(low * 4);
  });
});

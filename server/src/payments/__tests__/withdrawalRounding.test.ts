import { describe, it, expect } from 'vitest';
import { usdtToUsdtRaw, usdtRawToChips, chipsToUsdtRaw } from '../exchange.js';

// Вывод средств: сумма к отправке и списание фишек считались независимо, и обе конвертации
// округляют ВНИЗ — запрошенная сумма могла быть на доли цента больше списания, разница уходила
// из кассы (security review 2026-08-24). Теперь отправляем ровно то, что покрыто списанием.
const RATE = 10_000; // центов фишек за 1 USDT

// Как считает withdrawalService: запрос → фишки → фактическая выплата.
function quote(amountUsdt: number) {
  const requestedRaw = usdtToUsdtRaw(amountUsdt);
  const chips = usdtRawToChips(requestedRaw, RATE);
  const payoutRaw = chipsToUsdtRaw(chips, RATE);
  return { requestedRaw, chips, payoutRaw };
}

describe('вывод средств — выплата не превышает списание', () => {
  it('ровная сумма: сколько списали, столько и отправили', () => {
    const q = quote(1);
    expect(q.chips).toBe(10_000);
    expect(q.payoutRaw).toBe(1_000_000n);
    expect(q.payoutRaw).toBe(q.requestedRaw);
  });

  it('сумма с «хвостом» мельче цента — выплата срезается до покрытой списанием', () => {
    const q = quote(1.0000019); // 1.000001 USDT после усечения до 6 знаков
    expect(q.requestedRaw).toBe(1_000_001n);
    expect(q.chips).toBe(10_000);          // списываем целые центы, вниз
    expect(q.payoutRaw).toBe(1_000_000n);  // и отправляем ровно их, а не запрошенное
    expect(q.payoutRaw).toBeLessThan(q.requestedRaw); // раньше здесь была утечка 0.000001 USDT
  });

  it('инвариант на диапазоне сумм: выплата никогда не больше запроса и всегда покрыта фишками', () => {
    for (const amount of [0.5, 1.234567, 9.999999, 12.000001, 100.7, 250.123456]) {
      const q = quote(amount);
      expect(q.payoutRaw).toBeLessThanOrEqual(q.requestedRaw);
      expect(usdtRawToChips(q.payoutRaw, RATE)).toBeLessThanOrEqual(q.chips);
    }
  });

  it('нестандартный курс тоже не даёт переплаты', () => {
    const rate = 7_777;
    const requestedRaw = usdtToUsdtRaw(3.333333);
    const chips = usdtRawToChips(requestedRaw, rate);
    const payoutRaw = chipsToUsdtRaw(chips, rate);
    expect(payoutRaw).toBeLessThanOrEqual(requestedRaw);
  });
});

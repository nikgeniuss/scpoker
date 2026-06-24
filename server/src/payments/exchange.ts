// Конвертация USDT↔фишки (§11.1 ROADMAP). USDT — 6 знаков после запятой на всех трёх сетях
// (TRC-20/ERC-20/BEP-20), храним суммы в "raw"-юнитах (bigint) — как и сами контракты.
// Фишки — целые центы (см. chipFormat.ts, денежная модель проекта).

const USDT_SMALLEST_UNIT = 1_000_000n; // 10^6

// Курс: exchangeRateCentsPerUsdt = сколько центов фишек равны 1 USDT.
export function usdtRawToChips(amountUsdtRaw: bigint, exchangeRateCentsPerUsdt: number): number {
  if (amountUsdtRaw < 0n) throw new Error('amountUsdtRaw must be non-negative');
  if (!Number.isInteger(exchangeRateCentsPerUsdt) || exchangeRateCentsPerUsdt <= 0) {
    throw new Error('exchangeRateCentsPerUsdt must be a positive integer');
  }
  // Округление вниз — при зачислении депозита никогда не кредитуем больше, чем пришло.
  const chips = (amountUsdtRaw * BigInt(exchangeRateCentsPerUsdt)) / USDT_SMALLEST_UNIT;
  return Number(chips);
}

export function chipsToUsdtRaw(chips: number, exchangeRateCentsPerUsdt: number): bigint {
  if (!Number.isFinite(chips) || chips < 0) throw new Error('chips must be a non-negative finite number');
  if (!Number.isInteger(exchangeRateCentsPerUsdt) || exchangeRateCentsPerUsdt <= 0) {
    throw new Error('exchangeRateCentsPerUsdt must be a positive integer');
  }
  // Округление вниз — при выводе никогда не отправляем больше USDT, чем покрывают списанные фишки.
  return (BigInt(Math.floor(chips)) * USDT_SMALLEST_UNIT) / BigInt(exchangeRateCentsPerUsdt);
}

export function usdtToUsdtRaw(amountUsdt: number): bigint {
  if (!Number.isFinite(amountUsdt) || amountUsdt < 0) throw new Error('amountUsdt must be a non-negative finite number');
  return BigInt(Math.floor(amountUsdt * 1_000_000));
}

export function usdtRawToUsdt(amountUsdtRaw: bigint): number {
  return Number(amountUsdtRaw) / 1_000_000;
}

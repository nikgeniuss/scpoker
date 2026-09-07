import type { DepositRecord, WithdrawalRequest } from '@poker-room/shared';

// История платежей игрока (ROADMAP §11.1): фильтр по типу операции и выгрузка CSV.
// Общий модуль для обоих скинов кошелька (Wallet.tsx и AkWallet.tsx) — раньше каждый строил
// список сам, и любая правка означала бы две одинаковые правки.

export type PaymentFilter = 'all' | 'deposits' | 'withdrawals';

export const PAYMENT_FILTERS: PaymentFilter[] = ['all', 'deposits', 'withdrawals'];

export function showDeposits(filter: PaymentFilter): boolean {
  return filter !== 'withdrawals';
}

export function showWithdrawals(filter: PaymentFilter): boolean {
  return filter !== 'deposits';
}

// Строка CSV: кавычки удваиваются, значение всегда в кавычках — суммы и адреса не разъедутся
// по колонкам из-за запятой в локали или в тексте причины отказа.
function cell(value: string | number): string {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

// USDT приходит «сырым» целым (6 знаков после запятой) — в выгрузке нужен читаемый вид.
function usdtFromRaw(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? (n / 1_000_000).toFixed(6) : raw;
}

// CSV по обеим сторонам истории. Заголовок на английском: файл открывают в Excel/Sheets и
// парсят скриптами, кириллица в заголовках колонок этому только мешает.
export function toCsv(
  deposits: DepositRecord[],
  withdrawals: WithdrawalRequest[],
  filter: PaymentFilter = 'all',
): string {
  const header = ['date', 'type', 'chain', 'amount_usdt', 'amount_chips', 'status', 'txid'];
  const rows: string[][] = [];

  if (showDeposits(filter)) {
    for (const d of deposits) {
      rows.push([d.creditedAt, 'deposit', d.chain, usdtFromRaw(d.amountUsdtRaw), String(d.amountChipsCredited), 'credited', d.txid]);
    }
  }
  if (showWithdrawals(filter)) {
    for (const w of withdrawals) {
      rows.push([w.createdAt, 'withdrawal', w.chain, usdtFromRaw(w.amountUsdtRaw), String(w.amountChips), w.status, w.txid ?? '']);
    }
  }

  // Свежие сверху — тот же порядок, что на экране.
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export function csvFileName(now = new Date()): string {
  return 'poker-hub-payments-' + now.toISOString().slice(0, 10) + '.csv';
}

import { readJSON, writeJSON } from '../auth/storage.js';
import type { PaymentChain } from '@poker-room/shared';

// Последний обработанный блок на КАЖДЫЙ депозитный адрес (ROADMAP §9.2): раньше evmAdapter
// смотрел фиксированное окно назад от головы сети, и простой сервера дольше окна (~15-20 мин на
// Ethereum, ~4-5 мин на BSC) оставлял диапазон блоков непросмотренным навсегда — реальный
// депозит игрока просто не детектился. Курсор не заменяет дедуп по (chain, txid) в deposits.json,
// а дополняет его: потеря курсора приведёт максимум к повторному сканированию, не к задвоению.
const FILE = 'deposit-cursors.json';

export type DepositCursors = Record<string, number>;

// Ключ включает сеть: EVM-адрес общий для ethereum и bsc (одна деривация), а высота блока — своя.
export function cursorKey(chain: PaymentChain, address: string): string {
  return `${chain}:${address}`;
}

export function readCursors(): DepositCursors {
  try {
    return readJSON(FILE) as DepositCursors;
  } catch {
    return {};
  }
}

export function writeCursors(cursors: DepositCursors): void {
  writeJSON(FILE, cursors);
}

import { chainFamilyOf } from './chains/index.js';
import { HOT_WALLET_PRIVATE_KEY_TRON, HOT_WALLET_PRIVATE_KEY_EVM } from '../config.js';
import type { PaymentChain } from '@poker-room/shared';

// Хот-кошелёк выплат — отдельный секрет от seed депозитных адресов (§0, два разных ключа).
// Используется и для авто-выплат (payoutService), и для свипа депозитов (sweepService).
export function hotWalletKeyFor(chain: PaymentChain): string | null {
  return chainFamilyOf(chain) === 'tron' ? HOT_WALLET_PRIVATE_KEY_TRON : HOT_WALLET_PRIVATE_KEY_EVM;
}

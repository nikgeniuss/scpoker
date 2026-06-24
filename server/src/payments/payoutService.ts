import { getChainAdapter } from './chains/index.js';
import { markSending, markPaid, markFailed } from './withdrawalService.js';
import { hotWalletKeyFor } from './hotWallet.js';
import type { PaymentChain, WithdrawalRequest } from '@poker-room/shared';

// Отправляет одобренную заявку реальной транзакцией. Статус 'sending' фиксируется СИНХРОННО
// до broadcast — если сервер падает между broadcast и markPaid/markFailed, заявка остаётся
// в 'sending' для ручной проверки админом (план §11.1: нельзя слепо повторить отправку денег).
export async function sendPayout(withdrawal: WithdrawalRequest): Promise<{ txid: string } | { error: string }> {
  const adapter = getChainAdapter(withdrawal.chain);
  if (!adapter) return { error: 'chain-not-configured' };
  const privateKey = hotWalletKeyFor(withdrawal.chain);
  if (!privateKey) return { error: 'hot-wallet-not-configured' };

  const sending = markSending(withdrawal.id);
  if ('error' in sending) return sending;

  try {
    const amountRaw = BigInt(withdrawal.amountUsdtRaw);
    const { txid } = await adapter.sendUsdt(privateKey, withdrawal.payoutAddress, amountRaw);
    markPaid(withdrawal.id, txid);
    return { txid };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    markFailed(withdrawal.id, reason);
    return { error: reason };
  }
}

export interface HotWalletBalance {
  address: string;
  native: string; // в минимальных единицах сети (sun/wei), строкой — bigint не сериализуется в JSON
  usdt: string;
}

// Баланс хот-кошельков для админ-мониторинга — без TRX/ETH/BNB на комиссию авто-выплаты падают
// с ошибкой broadcast (см. sendPayout → markFailed), это видно админу заранее.
export async function getHotWalletBalances(): Promise<Record<PaymentChain, HotWalletBalance | null>> {
  const result = {} as Record<PaymentChain, HotWalletBalance | null>;
  for (const chain of ['tron', 'ethereum', 'bsc'] as const) {
    const adapter = getChainAdapter(chain);
    const privateKey = hotWalletKeyFor(chain);
    if (!adapter || !privateKey) {
      result[chain] = null;
      continue;
    }
    const address = adapter.addressFromPrivateKey(privateKey);
    const [native, usdt] = await Promise.all([adapter.getNativeBalance(address), adapter.getUsdtBalance(address)]);
    result[chain] = { address, native: native.toString(), usdt: usdt.toString() };
  }
  return result;
}

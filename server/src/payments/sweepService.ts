import { getChainAdapter } from './chains/index.js';
import { hotWalletKeyFor } from './hotWallet.js';
import type { PaymentChain } from '@poker-room/shared';

const FUND_POLL_INTERVAL_MS = 4000;
const FUND_POLL_MAX_ATTEMPTS = 15; // ~1 минута ожидания подтверждения фандинг-транзакции

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Переносит реально пришедшие USDT с персонального депозитного адреса игрока на хот-кошелёк
// (найдено на testnet-прогоне 2026-06-19: без этого хот-кошелёк никогда не наполняется от
// депозитов, и автовыплаты со временем останутся без покрытия). Депозитный адрес обычно без
// нативной монеты на газ — сначала фондируем его с хот-кошелька, потом шлём sendUsdt обратно.
export async function sweepDeposit(
  chain: PaymentChain,
  depositAddress: string,
  depositPrivateKey: string,
  amountRaw: bigint,
): Promise<{ txid: string } | { error: string }> {
  const adapter = getChainAdapter(chain);
  if (!adapter) return { error: 'chain-not-configured' };
  const hotWalletPrivateKey = hotWalletKeyFor(chain);
  if (!hotWalletPrivateKey) return { error: 'hot-wallet-not-configured' };
  const hotWalletAddress = adapter.addressFromPrivateKey(hotWalletPrivateKey);

  try {
    const requiredGas = await adapter.estimateSweepFee();
    const currentNative = await adapter.getNativeBalance(depositAddress);
    if (currentNative < requiredGas) {
      await adapter.sendNative(hotWalletPrivateKey, depositAddress, requiredGas - currentNative);
      let funded = false;
      for (let attempt = 0; attempt < FUND_POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(FUND_POLL_INTERVAL_MS);
        if ((await adapter.getNativeBalance(depositAddress)) >= requiredGas) {
          funded = true;
          break;
        }
      }
      if (!funded) return { error: 'gas-funding-not-confirmed' };
    }

    const { txid } = await adapter.sendUsdt(depositPrivateKey, hotWalletAddress, amountRaw);
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

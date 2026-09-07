import type { PaymentChain } from '@poker-room/shared';
import type { ChainAdapter } from './types.js';
import { createTronAdapter } from './tronAdapter.js';
import { createEvmAdapter } from './evmAdapter.js';
import {
  TRONGRID_FULL_HOST,
  TRON_FEE_LIMIT_SUN,
  TRONGRID_API_KEY,
  TRON_USDT_CONTRACT,
  ETH_RPC_URL,
  ETH_USDT_CONTRACT,
  BSC_RPC_URL,
  BSC_USDT_CONTRACT,
} from '../../config.js';

// Адаптер создаётся только если для сети задан контракт USDT (mainnet — дефолт из config.ts,
// testnet — нужно явно прописать адрес тестового токена). Без контракта сеть не настроена —
// возвращаем null вместо адаптера, остальной код это явно проверяет (не фейлит молча).
const adapters: Partial<Record<PaymentChain, ChainAdapter>> = {};

if (TRON_USDT_CONTRACT) {
  adapters.tron = createTronAdapter({
    fullHost: TRONGRID_FULL_HOST,
    apiKey: TRONGRID_API_KEY,
    usdtContractAddress: TRON_USDT_CONTRACT,
    feeLimitSun: TRON_FEE_LIMIT_SUN,
  });
}
if (ETH_USDT_CONTRACT) {
  adapters.ethereum = createEvmAdapter({
    chain: 'ethereum',
    nativeSymbol: 'ETH',
    rpcUrl: ETH_RPC_URL,
    usdtContractAddress: ETH_USDT_CONTRACT,
  });
}
if (BSC_USDT_CONTRACT) {
  adapters.bsc = createEvmAdapter({
    chain: 'bsc',
    nativeSymbol: 'BNB',
    rpcUrl: BSC_RPC_URL,
    usdtContractAddress: BSC_USDT_CONTRACT,
  });
}

export function getChainAdapter(chain: PaymentChain): ChainAdapter | null {
  return adapters[chain] ?? null;
}

export function getAllChainAdapters(): Array<{ chain: PaymentChain; adapter: ChainAdapter }> {
  return (Object.entries(adapters) as Array<[PaymentChain, ChainAdapter]>).map(([chain, adapter]) => ({ chain, adapter }));
}

// 'tron' использует свой seed/деривацию, 'ethereum'+'bsc' делят EVM-семейство (один адрес на обе сети).
export function chainFamilyOf(chain: PaymentChain): 'tron' | 'evm' {
  return chain === 'tron' ? 'tron' : 'evm';
}

export type { ChainAdapter, IncomingTransfer } from './types.js';

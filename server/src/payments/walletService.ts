import { readWallets, writeWallets } from './walletsStorage.js';
import { getChainAdapter } from './chains/index.js';
import { DEPOSIT_SEED_MNEMONIC_TRON, DEPOSIT_SEED_MNEMONIC_EVM } from '../config.js';
import type { ChainFamily, WalletMapping } from '@poker-room/shared';

function mnemonicFor(family: ChainFamily): string | null {
  return family === 'tron' ? DEPOSIT_SEED_MNEMONIC_TRON : DEPOSIT_SEED_MNEMONIC_EVM;
}

// Деривация одинакова для любой сети одного chainFamily (ethereum и bsc делят EVM-адрес) —
// берём первый сконфигурированный адаптер семейства, он нужен только для deriveAddress.
function adapterForFamily(family: ChainFamily) {
  if (family === 'tron') return getChainAdapter('tron');
  return getChainAdapter('ethereum') ?? getChainAdapter('bsc');
}

export function getOrCreateDepositAddress(
  userId: string,
  chainFamily: ChainFamily,
): WalletMapping | { error: 'chain-family-not-configured' } {
  const mnemonic = mnemonicFor(chainFamily);
  const adapter = adapterForFamily(chainFamily);
  if (!mnemonic || !adapter) return { error: 'chain-family-not-configured' };

  const wallets = readWallets();
  const existing = wallets.find((w) => w.userId === userId && w.chainFamily === chainFamily);
  if (existing) return existing;

  // Индекс — следующий по счёту в рамках семейства; записи никогда не удаляются, поэтому
  // length всегда даёт свободный индекс без коллизий (как nextIndex без отдельного счётчика).
  const derivationIndex = wallets.filter((w) => w.chainFamily === chainFamily).length;
  const { address } = adapter.deriveAddress(mnemonic, derivationIndex);
  const mapping: WalletMapping = {
    userId,
    chainFamily,
    address,
    derivationIndex,
    createdAt: new Date().toISOString(),
  };
  wallets.push(mapping);
  writeWallets(wallets);
  return mapping;
}

export function getAllDepositAddresses(chainFamily: ChainFamily): WalletMapping[] {
  return readWallets().filter((w) => w.chainFamily === chainFamily);
}

// Приватный ключ депозитного адреса не хранится — передеривируем по тому же mnemonic+index
// (детерминированно, см. тесты деривации). Нужен sweepService для переноса USDT на хот-кошелёк.
export function getDepositPrivateKey(wallet: WalletMapping): string | null {
  const mnemonic = mnemonicFor(wallet.chainFamily);
  const adapter = adapterForFamily(wallet.chainFamily);
  if (!mnemonic || !adapter) return null;
  return adapter.deriveAddress(mnemonic, wallet.derivationIndex).privateKey;
}

// EVM-адреса регистронезависимы (hex), Tron-адреса (base58) — регистрозависимы.
function normalizeAddress(chainFamily: ChainFamily, address: string): string {
  return chainFamily === 'evm' ? address.toLowerCase() : address;
}

export function getUserIdByAddress(chainFamily: ChainFamily, address: string): string | null {
  const target = normalizeAddress(chainFamily, address);
  return (
    readWallets().find(
      (w) => w.chainFamily === chainFamily && normalizeAddress(chainFamily, w.address) === target,
    )?.userId ?? null
  );
}

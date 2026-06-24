import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));
vi.mock('../../config.js', () => ({
  DEPOSIT_SEED_MNEMONIC_TRON: 'tron-fake-mnemonic',
  DEPOSIT_SEED_MNEMONIC_EVM: 'evm-fake-mnemonic',
}));
vi.mock('../chains/index.js', () => ({
  // Фейковый адаптер: адрес детерминирован от mnemonic+index, без реальной деривации/сети.
  getChainAdapter: (chain: string) => ({
    chain,
    nativeSymbol: 'X',
    deriveAddress: (mnemonic: string, index: number) => ({
      address: `${mnemonic}-${index}`,
      privateKey: `pk-${mnemonic}-${index}`,
    }),
    isValidAddress: () => true,
  }),
}));

import { clearStorage } from './helpers/storage.js';
import { getOrCreateDepositAddress, getAllDepositAddresses, getUserIdByAddress } from '../walletService.js';

beforeEach(() => clearStorage());

describe('walletService — getOrCreateDepositAddress', () => {
  it('создаёт новый адрес при первом обращении', () => {
    const result = getOrCreateDepositAddress('user1', 'tron');
    expect('error' in result).toBe(false);
    const mapping = result as Exclude<typeof result, { error: string }>;
    expect(mapping.userId).toBe('user1');
    expect(mapping.chainFamily).toBe('tron');
    expect(mapping.derivationIndex).toBe(0);
    expect(mapping.address).toBe('tron-fake-mnemonic-0');
  });

  it('повторный вызов для того же userId+chainFamily возвращает тот же адрес (идемпотентно)', () => {
    const first = getOrCreateDepositAddress('user1', 'tron');
    const second = getOrCreateDepositAddress('user1', 'tron');
    expect(first).toEqual(second);
  });

  it('разным пользователям выдаются разные адреса с растущим индексом', () => {
    const a = getOrCreateDepositAddress('user1', 'tron');
    const b = getOrCreateDepositAddress('user2', 'tron');
    const aMapping = a as { derivationIndex: number; address: string };
    const bMapping = b as { derivationIndex: number; address: string };
    expect(aMapping.derivationIndex).toBe(0);
    expect(bMapping.derivationIndex).toBe(1);
    expect(aMapping.address).not.toBe(bMapping.address);
  });

  it('tron и evm — независимые семейства, индексы не пересекаются', () => {
    const tron = getOrCreateDepositAddress('user1', 'tron');
    const evm = getOrCreateDepositAddress('user1', 'evm');
    expect((tron as { derivationIndex: number }).derivationIndex).toBe(0);
    expect((evm as { derivationIndex: number }).derivationIndex).toBe(0);
    expect((tron as { address: string }).address).not.toBe((evm as { address: string }).address);
  });

  it('getAllDepositAddresses фильтрует по chainFamily', () => {
    getOrCreateDepositAddress('user1', 'tron');
    getOrCreateDepositAddress('user2', 'tron');
    getOrCreateDepositAddress('user1', 'evm');
    expect(getAllDepositAddresses('tron')).toHaveLength(2);
    expect(getAllDepositAddresses('evm')).toHaveLength(1);
  });

  it('getUserIdByAddress находит владельца адреса', () => {
    const mapping = getOrCreateDepositAddress('user1', 'tron') as { address: string };
    expect(getUserIdByAddress('tron', mapping.address)).toBe('user1');
    expect(getUserIdByAddress('tron', 'unknown-address')).toBeNull();
  });

  it('getUserIdByAddress для evm регистронезависим', () => {
    const mapping = getOrCreateDepositAddress('user1', 'evm') as { address: string };
    expect(getUserIdByAddress('evm', mapping.address.toUpperCase())).toBe('user1');
  });
});

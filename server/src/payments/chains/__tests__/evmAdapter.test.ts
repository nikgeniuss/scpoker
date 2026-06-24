import { describe, it, expect } from 'vitest';
import { createEvmAdapter } from '../evmAdapter.js';

// Деривация и валидация адреса — чистая логика, без сети (RPC-вызовы покрыты testnet-прогоном, ROADMAP §11.1).
describe('evmAdapter — деривация адресов (общий код для ethereum/bsc)', () => {
  const ethereum = createEvmAdapter({ chain: 'ethereum', nativeSymbol: 'ETH', rpcUrl: 'https://example.invalid', usdtContractAddress: '0x0000000000000000000000000000000000000001' });
  const bsc = createEvmAdapter({ chain: 'bsc', nativeSymbol: 'BNB', rpcUrl: 'https://example.invalid', usdtContractAddress: '0x0000000000000000000000000000000000000002' });
  const mnemonic = 'test test test test test test test test test test test junk';

  it('детерминирована: один и тот же mnemonic+index → один и тот же адрес', () => {
    const a = ethereum.deriveAddress(mnemonic, 0);
    const b = ethereum.deriveAddress(mnemonic, 0);
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('разные индексы → разные адреса', () => {
    const a = ethereum.deriveAddress(mnemonic, 0);
    const b = ethereum.deriveAddress(mnemonic, 1);
    expect(a.address).not.toBe(b.address);
  });

  it('EVM-адрес идентичен на ethereum и bsc для того же mnemonic+index (общий адрес для обеих сетей)', () => {
    const onEth = ethereum.deriveAddress(mnemonic, 3);
    const onBsc = bsc.deriveAddress(mnemonic, 3);
    expect(onEth.address).toBe(onBsc.address);
  });

  it('isValidAddress принимает корректный EVM-адрес и отклоняет мусор', () => {
    const { address } = ethereum.deriveAddress(mnemonic, 0);
    expect(ethereum.isValidAddress(address)).toBe(true);
    expect(ethereum.isValidAddress('not-an-address')).toBe(false);
    expect(ethereum.isValidAddress('TXfakeTronAddress1111111111111111')).toBe(false);
  });
});

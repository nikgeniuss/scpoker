import { describe, it, expect } from 'vitest';
import { createTronAdapter } from '../tronAdapter.js';

// Деривация и валидация адреса — чистая логика, без сети (RPC-вызовы покрыты testnet-прогоном, ROADMAP §11.1).
describe('tronAdapter — деривация адресов', () => {
  const adapter = createTronAdapter({ fullHost: 'https://api.shasta.trongrid.io', apiKey: null, usdtContractAddress: 'T-fake' });
  const mnemonic = 'test test test test test test test test test test test junk';

  it('детерминирована: один и тот же mnemonic+index → один и тот же адрес', () => {
    const a = adapter.deriveAddress(mnemonic, 0);
    const b = adapter.deriveAddress(mnemonic, 0);
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('разные индексы → разные адреса', () => {
    const a = adapter.deriveAddress(mnemonic, 0);
    const b = adapter.deriveAddress(mnemonic, 1);
    expect(a.address).not.toBe(b.address);
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('выведенный адрес проходит собственную валидацию isValidAddress', () => {
    const { address } = adapter.deriveAddress(mnemonic, 5);
    expect(adapter.isValidAddress(address)).toBe(true);
    expect(address.startsWith('T')).toBe(true);
  });

  it('isValidAddress отклоняет мусор', () => {
    expect(adapter.isValidAddress('not-an-address')).toBe(false);
    expect(adapter.isValidAddress('')).toBe(false);
  });
});

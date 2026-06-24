import { readJSON, writeJSON } from '../auth/storage.js';
import type { WalletMapping } from '@poker-room/shared';

const FILE = 'wallets.json';

export function readWallets(): WalletMapping[] {
  try {
    return readJSON(FILE) as WalletMapping[];
  } catch {
    return [];
  }
}

export function writeWallets(wallets: WalletMapping[]): void {
  writeJSON(FILE, wallets);
}

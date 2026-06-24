import { readJSON, writeJSON } from '../auth/storage.js';
import type { DepositRecord } from '@poker-room/shared';

const FILE = 'deposits.json';

export function readDeposits(): DepositRecord[] {
  try {
    return readJSON(FILE) as DepositRecord[];
  } catch {
    return [];
  }
}

export function writeDeposits(deposits: DepositRecord[]): void {
  writeJSON(FILE, deposits);
}

import { readJSON, writeJSON } from '../auth/storage.js';
import type { WithdrawalRequest } from '@poker-room/shared';

const FILE = 'withdrawals.json';

export function readWithdrawals(): WithdrawalRequest[] {
  try {
    return readJSON(FILE) as WithdrawalRequest[];
  } catch {
    return [];
  }
}

export function writeWithdrawals(withdrawals: WithdrawalRequest[]): void {
  writeJSON(FILE, withdrawals);
}

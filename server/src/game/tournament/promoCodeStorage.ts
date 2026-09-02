import { readJSON, writeJSON } from '../../auth/storage.js';
import type { PromoCode } from '@poker-room/shared';

const FILE = 'promoCodes.json';

export function readPromoCodes(): PromoCode[] {
  try {
    const data = readJSON(FILE) as PromoCode[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writePromoCodes(codes: PromoCode[]): void {
  writeJSON(FILE, codes);
}

// Лог массовых выдач/возвратов фишек из админки (ROADMAP §10.9 «История операций»).
// Источник правды — server/data/chip-ops.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'chip-ops.json';
const CAP = 200;

export interface ChipOpEntry {
  ts: number; // epoch ms
  by: string; // ник админа
  mode: 'add' | 'subtract';
  amount: number; // центы, за одного игрока
  usernames: string[]; // кому применили
}

function load(): ChipOpEntry[] {
  try {
    const raw = readJSON(FILE);
    return Array.isArray(raw) ? raw as ChipOpEntry[] : [];
  } catch {
    return [];
  }
}

// Запись одной массовой операции (один вызов /admin/users/bulk-chips).
export function recordChipOp(entry: Omit<ChipOpEntry, 'ts'>): void {
  const log = load();
  log.unshift({ ts: Date.now(), ...entry });
  writeJSON(FILE, log.slice(0, CAP));
}

export function getChipOpsLog(limit = 50): ChipOpEntry[] {
  return load().slice(0, limit);
}

import { readJSON, writeJSON } from '../../auth/storage.js';
import type { TournamentInfo } from '@poker-room/shared';

const FILE = 'tournaments.json';

export function readTournaments(): TournamentInfo[] {
  try {
    const data = readJSON(FILE) as TournamentInfo[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeTournaments(tournaments: TournamentInfo[]): void {
  writeJSON(FILE, tournaments);
}

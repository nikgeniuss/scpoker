import { readJSON, writeJSON } from '../auth/storage.js';

export interface ClubMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface PendingRequest {
  userId: string;
  username: string;
  requestedAt: string;
}

export interface Club {
  id: string;
  name: string;
  ownerId: string;
  members: ClubMember[];
  inviteCode: string;
  pendingRequests: PendingRequest[];
  settings: Record<string, unknown>;
  createdAt: string;
}

const FILE = 'clubs.json';

export function readClubs(): Club[] {
  try {
    return readJSON(FILE) as Club[];
  } catch {
    return [];
  }
}

export function writeClubs(clubs: Club[]): void {
  writeJSON(FILE, clubs);
}

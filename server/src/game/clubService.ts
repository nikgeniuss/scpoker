import { randomBytes } from 'crypto';
import { readJSON } from '../auth/storage.js';
import { readClubs, writeClubs, type Club } from './clubsStorage.js';

type ClubError = { error: string };

function generateId(): string {
  return randomBytes(8).toString('hex');
}

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function getUsernameById(userId: string): string {
  try {
    const users = readJSON('users.json') as Array<{ id: string; username: string }>;
    return users.find((u) => u.id === userId)?.username ?? userId;
  } catch {
    return userId;
  }
}

export function createClub(ownerId: string, name: string): Club | ClubError {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 50) return { error: 'invalid-name' };
  const clubs = readClubs();
  if (clubs.some((c) => c.ownerId === ownerId)) return { error: 'already-owns-club' };
  if (clubs.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return { error: 'name-taken' };
  const club: Club = {
    id: generateId(),
    name: trimmed,
    ownerId,
    members: [{ userId: ownerId, username: getUsernameById(ownerId), role: 'owner', joinedAt: new Date().toISOString() }],
    inviteCode: generateInviteCode(),
    pendingRequests: [],
    settings: {},
    createdAt: new Date().toISOString(),
  };
  clubs.push(club);
  writeClubs(clubs);
  return club;
}

export function getClubById(id: string): Club | null {
  return readClubs().find((c) => c.id === id) ?? null;
}

export function getMyClub(userId: string): Club | null {
  return readClubs().find((c) => c.members.some((m) => m.userId === userId)) ?? null;
}

export function updateClub(clubId: string, ownerId: string, updates: { name?: string; openJoin?: boolean }): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx === -1) return { error: 'not-found' };
  if (clubs[idx].ownerId !== ownerId) return { error: 'forbidden' };
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed || trimmed.length > 50) return { error: 'invalid-name' };
    clubs[idx].name = trimmed;
  }
  if (updates.openJoin !== undefined) {
    clubs[idx].settings.openJoin = updates.openJoin;
  }
  writeClubs(clubs);
  return clubs[idx];
}

export function searchOpenClubs(query: string): Array<{ id: string; name: string; memberCount: number }> {
  const q = query.trim().toLowerCase();
  return readClubs()
    .filter((c) => c.settings.openJoin === true && (!q || c.name.toLowerCase().includes(q)))
    .map((c) => ({ id: c.id, name: c.name, memberCount: c.members.length }));
}

export function joinByCode(userId: string, code: string): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.inviteCode === code.trim().toUpperCase());
  if (idx === -1) return { error: 'invalid-code' };
  if (clubs[idx].members.some((m) => m.userId === userId)) return { error: 'already-member' };
  clubs[idx].members.push({
    userId,
    username: getUsernameById(userId),
    role: 'member',
    joinedAt: new Date().toISOString(),
  });
  clubs[idx].pendingRequests = clubs[idx].pendingRequests.filter((r) => r.userId !== userId);
  writeClubs(clubs);
  return clubs[idx];
}

export function submitJoinRequest(userId: string, clubId: string): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx === -1) return { error: 'not-found' };
  if (clubs[idx].members.some((m) => m.userId === userId)) return { error: 'already-member' };
  if (clubs[idx].pendingRequests.some((r) => r.userId === userId)) return { error: 'already-requested' };
  clubs[idx].pendingRequests.push({
    userId,
    username: getUsernameById(userId),
    requestedAt: new Date().toISOString(),
  });
  writeClubs(clubs);
  return clubs[idx];
}

export function handleJoinRequest(
  clubId: string,
  ownerId: string,
  targetUserId: string,
  approve: boolean,
): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx === -1) return { error: 'not-found' };
  if (clubs[idx].ownerId !== ownerId) return { error: 'forbidden' };
  if (!clubs[idx].pendingRequests.some((r) => r.userId === targetUserId)) return { error: 'no-request' };
  const req = clubs[idx].pendingRequests.find((r) => r.userId === targetUserId)!;
  clubs[idx].pendingRequests = clubs[idx].pendingRequests.filter((r) => r.userId !== targetUserId);
  if (approve) {
    clubs[idx].members.push({
      userId: targetUserId,
      username: req.username,
      role: 'member',
      joinedAt: new Date().toISOString(),
    });
  }
  writeClubs(clubs);
  return clubs[idx];
}

export function kickMember(clubId: string, ownerId: string, targetUserId: string): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx === -1) return { error: 'not-found' };
  if (clubs[idx].ownerId !== ownerId) return { error: 'forbidden' };
  if (targetUserId === ownerId) return { error: 'cannot-kick-owner' };
  if (!clubs[idx].members.some((m) => m.userId === targetUserId)) return { error: 'not-member' };
  clubs[idx].members = clubs[idx].members.filter((m) => m.userId !== targetUserId);
  writeClubs(clubs);
  return clubs[idx];
}

export function regenerateInviteCode(clubId: string, ownerId: string): Club | ClubError {
  const clubs = readClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx === -1) return { error: 'not-found' };
  if (clubs[idx].ownerId !== ownerId) return { error: 'forbidden' };
  clubs[idx].inviteCode = generateInviteCode();
  writeClubs(clubs);
  return clubs[idx];
}

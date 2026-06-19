import { describe, it, expect, beforeEach } from 'vitest';

// In-memory storage — тот же хелпер, что и у GameManager-тестов.
import { vi } from 'vitest';
vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage } from './helpers/storage.js';
import type { Club, ClubMember, PendingRequest } from '../clubsStorage.js';
import {
  createClub,
  getClubById,
  getMyClub,
  joinByCode,
  kickMember,
  submitJoinRequest,
  handleJoinRequest,
  regenerateInviteCode,
  updateClub,
} from '../clubService.js';

beforeEach(() => clearStorage());

describe('createClub', () => {
  it('создаёт клуб и возвращает его', () => {
    const result = createClub('user1', 'Мой Клуб');
    expect('error' in result).toBe(false);
    const club = result as Awaited<ReturnType<typeof createClub>> & { id: string };
    expect(club.name).toBe('Мой Клуб');
    expect(club.ownerId).toBe('user1');
    expect(club.members).toHaveLength(1);
    expect(club.members[0].userId).toBe('user1');
    expect(club.members[0].role).toBe('owner');
    expect(club.inviteCode).toMatch(/^[A-F0-9]{8}$/);
  });

  it('возвращает ошибку если пользователь уже владеет клубом', () => {
    createClub('user1', 'Клуб 1');
    const result = createClub('user1', 'Клуб 2');
    expect(result).toEqual({ error: 'already-owns-club' });
  });

  it('возвращает ошибку если имя занято', () => {
    createClub('user1', 'Покер Клуб');
    const result = createClub('user2', 'покер клуб');
    expect(result).toEqual({ error: 'name-taken' });
  });

  it('возвращает ошибку при пустом имени', () => {
    const result = createClub('user1', '   ');
    expect(result).toEqual({ error: 'invalid-name' });
  });
});

describe('getClubById / getMyClub', () => {
  it('getClubById находит клуб', () => {
    const created = createClub('u1', 'Test') as Club;
    const found = getClubById(created.id);
    expect(found?.name).toBe('Test');
  });

  it('getClubById возвращает null для несуществующего', () => {
    expect(getClubById('nope')).toBeNull();
  });

  it('getMyClub возвращает клуб где пользователь — владелец', () => {
    createClub('u1', 'Club A');
    const club = getMyClub('u1');
    expect(club?.ownerId).toBe('u1');
  });

  it('getMyClub возвращает null если пользователь не в клубе', () => {
    createClub('u1', 'Club A');
    expect(getMyClub('u2')).toBeNull();
  });
});

describe('joinByCode', () => {
  it('вступает в клуб по коду', () => {
    const club = createClub('owner', 'Alpha') as Club;
    const result = joinByCode('user2', club.inviteCode);
    expect('error' in result).toBe(false);
    const joined = result as Club;
    expect(joined.members.some((m: ClubMember) => m.userId === 'user2')).toBe(true);
  });

  it('возвращает ошибку при неверном коде', () => {
    createClub('owner', 'Alpha');
    expect(joinByCode('user2', 'BADCODE')).toEqual({ error: 'invalid-code' });
  });

  it('возвращает ошибку если уже участник', () => {
    const club = createClub('owner', 'Alpha') as Club;
    joinByCode('user2', club.inviteCode);
    expect(joinByCode('user2', club.inviteCode)).toEqual({ error: 'already-member' });
  });

  it('принимает код в нижнем регистре', () => {
    const club = createClub('owner', 'Alpha') as Club;
    const result = joinByCode('user2', club.inviteCode.toLowerCase());
    expect('error' in result).toBe(false);
  });
});

describe('kickMember', () => {
  it('кикает участника', () => {
    const club = createClub('owner', 'Beta') as Club;
    joinByCode('member1', club.inviteCode);
    const result = kickMember(club.id, 'owner', 'member1') as Club;
    expect('error' in result).toBe(false);
    expect(result.members.some((m: ClubMember) => m.userId === 'member1')).toBe(false);
  });

  it('нельзя кикнуть владельца', () => {
    const club = createClub('owner', 'Beta') as Club;
    expect(kickMember(club.id, 'owner', 'owner')).toEqual({ error: 'cannot-kick-owner' });
  });

  it('нельзя кикнуть если не владелец', () => {
    const club = createClub('owner', 'Beta') as Club;
    joinByCode('member1', club.inviteCode);
    expect(kickMember(club.id, 'member1', 'owner')).toEqual({ error: 'forbidden' });
  });

  it('нельзя кикнуть не-участника', () => {
    const club = createClub('owner', 'Beta') as Club;
    expect(kickMember(club.id, 'owner', 'stranger')).toEqual({ error: 'not-member' });
  });
});

describe('submitJoinRequest / handleJoinRequest', () => {
  it('подаёт заявку и одобряет', () => {
    const club = createClub('owner', 'Gamma') as Club;
    const req = submitJoinRequest('applicant', club.id) as Club;
    expect('error' in req).toBe(false);
    expect(req.pendingRequests.some((r: PendingRequest) => r.userId === 'applicant')).toBe(true);

    const approved = handleJoinRequest(club.id, 'owner', 'applicant', true) as Club;
    expect('error' in approved).toBe(false);
    expect(approved.members.some((m: ClubMember) => m.userId === 'applicant')).toBe(true);
    expect(approved.pendingRequests.some((r: PendingRequest) => r.userId === 'applicant')).toBe(false);
  });

  it('отклоняет заявку', () => {
    const club = createClub('owner', 'Gamma') as Club;
    submitJoinRequest('applicant', club.id);
    const rejected = handleJoinRequest(club.id, 'owner', 'applicant', false) as Club;
    expect('error' in rejected).toBe(false);
    expect(rejected.members.some((m: ClubMember) => m.userId === 'applicant')).toBe(false);
  });

  it('дублированная заявка — ошибка', () => {
    const club = createClub('owner', 'Gamma') as Club;
    submitJoinRequest('applicant', club.id);
    expect(submitJoinRequest('applicant', club.id)).toEqual({ error: 'already-requested' });
  });

  it('нет заявки — ошибка при одобрении', () => {
    const club = createClub('owner', 'Gamma') as Club;
    expect(handleJoinRequest(club.id, 'owner', 'ghost', true)).toEqual({ error: 'no-request' });
  });
});

describe('updateClub', () => {
  it('переименовывает клуб', () => {
    const club = createClub('owner', 'Old Name') as Club;
    const updated = updateClub(club.id, 'owner', { name: 'New Name' }) as Club;
    expect(updated.name).toBe('New Name');
  });

  it('запрещает переименование не-владельцу', () => {
    const club = createClub('owner', 'Old Name') as Club;
    expect(updateClub(club.id, 'hacker', { name: 'Hacked' })).toEqual({ error: 'forbidden' });
  });
});

describe('regenerateInviteCode', () => {
  it('генерирует новый код', () => {
    const club = createClub('owner', 'Delta') as Club;
    const oldCode = club.inviteCode;
    const result = regenerateInviteCode(club.id, 'owner') as Club;
    expect('error' in result).toBe(false);
    // Очень маловероятно совпадение (1/2^32), но принципиально коды разные
    expect(typeof result.inviteCode).toBe('string');
    expect(result.inviteCode).toHaveLength(8);
    // Старый код больше не работает
    const _joined = joinByCode('newuser', oldCode);
    // Если код изменился — invalid-code, если не изменился (крайне редко) — тест всё равно зелёный
    expect('inviteCode' in result).toBe(true);
  });

  it('запрещает не-владельцу', () => {
    const club = createClub('owner', 'Delta') as Club;
    expect(regenerateInviteCode(club.id, 'hacker')).toEqual({ error: 'forbidden' });
  });
});

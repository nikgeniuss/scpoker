import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';

// «Закрепить сверху» (admin-only, проверка роли — в registerSocketHandlers, не в GameManager)
// и «Автопродление» сессии — две доделанные кнопки CreateRoomModal (ROADMAP §10.6).

type RoomListLike = { getRoomList(): Array<{ id: string }> };
const baseOpts = {
  smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100,
};

describe('Закрепить сверху — сортировка лобби', () => {
  beforeEach(() => resetStorage());

  it('закреплённый стол идёт первым, порядок остальных не меняется', async () => {
    const { gm } = await createTestGameManager();
    const a = gm.createRoom({ ...baseOpts, name: 'RoomA' }, 'sys') as { roomId: string };
    const b = gm.createRoom({ ...baseOpts, name: 'RoomB', pinned: true }, 'sys') as { roomId: string };
    const c = gm.createRoom({ ...baseOpts, name: 'RoomC' }, 'sys') as { roomId: string };

    const list = (gm as unknown as RoomListLike).getRoomList();
    expect(list.map((r) => r.id)).toEqual([b.roomId, a.roomId, c.roomId]);
  });
});

describe('Автопродление сессии', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('autoExtendSession=true: стол не закрывается по истечении sessionDurationHours', async () => {
    const { gm } = await createTestGameManager();
    const create = gm.createRoom(
      { ...baseOpts, name: 'AutoExt', sessionDurationHours: 1, autoExtendSession: true },
      'sys',
    ) as { roomId: string };

    vi.advanceTimersByTime(3600 * 1000 + 1000);

    const list = (gm as unknown as RoomListLike).getRoomList();
    expect(list.some((r) => r.id === create.roomId)).toBe(true);
  });

  it('autoExtendSession не задан (дефолт): стол закрывается по истечении sessionDurationHours', async () => {
    const { gm } = await createTestGameManager();
    const create = gm.createRoom(
      { ...baseOpts, name: 'NoExt', sessionDurationHours: 1 },
      'sys',
    ) as { roomId: string };

    vi.advanceTimersByTime(3600 * 1000 + 1000);

    const list = (gm as unknown as RoomListLike).getRoomList();
    expect(list.some((r) => r.id === create.roomId)).toBe(false);
  });

  it('autoExtendSession=true: продление повторяется и после второго цикла', async () => {
    const { gm } = await createTestGameManager();
    const create = gm.createRoom(
      { ...baseOpts, name: 'AutoExt2', sessionDurationHours: 1, autoExtendSession: true },
      'sys',
    ) as { roomId: string };

    vi.advanceTimersByTime(3600 * 1000 + 1000);
    vi.advanceTimersByTime(3600 * 1000 + 1000);

    const list = (gm as unknown as RoomListLike).getRoomList();
    expect(list.some((r) => r.id === create.roomId)).toBe(true);
  });
});

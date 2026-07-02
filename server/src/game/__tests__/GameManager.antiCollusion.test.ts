import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer } from './helpers/gameManager.js';
import { getStorage, setStorage } from './helpers/storage.js';

// Зарегистрировать банкролл кандидата без посадки за стол (иначе canJoinRoom вернёт 'no-chips'
// раньше, чем дойдёт до anti-collusion проверки — порядок гейтов в seatDeny).
function registerBankroll(userId: string, chips: number): void {
  const users = (getStorage('users.json') as Array<{ id: string; username: string; chips: number }>) ?? [];
  users.push({ id: userId, username: userId + '-name', chips });
  setStorage('users.json', users);
}

// Доделка §10.6 (2026-06-26): anti-collusion — запрет второго места за столом с тем же IP/device.

async function setupRoom(antiCollusionEnabled: boolean) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'AntiCollRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, antiCollusionEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  return { gm, io, roomId: create.roomId };
}

describe('GameManager — anti-collusion (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён + тот же IP (другой device) → canJoinRoom отказывает', async () => {
    const { gm, io, roomId } = await setupRoom(true);
    const netA = { ip: '1.2.3.4', deviceId: 'dev-a' };
    const netB = { ip: '1.2.3.4', deviceId: 'dev-b' }; // тот же IP, другой device
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000, networkInfo: netA });
    expect(gm.canJoinRoom(roomId, 'B', undefined, undefined, netB)).toBe('anti-collusion');
  });

  it('включён + тот же deviceId (другой IP) → canJoinRoom отказывает', async () => {
    const { gm, io, roomId } = await setupRoom(true);
    const netA = { ip: '1.1.1.1', deviceId: 'same-device' };
    const netB = { ip: '2.2.2.2', deviceId: 'same-device' };
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000, networkInfo: netA });
    expect(gm.canJoinRoom(roomId, 'B', undefined, undefined, netB)).toBe('anti-collusion');
  });

  it('включён + разные IP/device → можно сесть', async () => {
    const { gm, io, roomId } = await setupRoom(true);
    const netA = { ip: '1.1.1.1', deviceId: 'dev-a' };
    const netB = { ip: '2.2.2.2', deviceId: 'dev-b' };
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000, networkInfo: netA });
    registerBankroll('B', 10_000);
    expect(gm.canJoinRoom(roomId, 'B', undefined, undefined, netB)).toBeNull();
  });

  it('выключен → одинаковый IP/device не мешает посадке', async () => {
    const { gm, io, roomId } = await setupRoom(false);
    const sameNet = { ip: '1.1.1.1', deviceId: 'dev-a' };
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000, networkInfo: sameNet });
    registerBankroll('B', 10_000);
    expect(gm.canJoinRoom(roomId, 'B', undefined, undefined, sameNet)).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, type GameManagerLike } from './helpers/gameManager.js';
import { setStorage } from './helpers/storage.js';

// Выбранный в профиле avatarSeed (users.json) должен попадать в Player.avatar при посадке,
// чтобы соперники за столом видели именно выбранный аватар, а не дефолтный по id.

type AvatarState = { players: Array<{ id: string; avatar: string }> };

function getState(gm: GameManagerLike, roomId: string): AvatarState {
  return gm.getGameState(roomId) as unknown as AvatarState;
}

async function setupRoom() {
  resetStorage();
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'AvatarRoom', smallBlind: 50, bigBlind: 100, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100 },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  return { gm, io, roomId: create.roomId };
}

describe('GameManager — выбранный аватар при посадке', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('player.avatar = avatarSeed из users.json, если он задан', async () => {
    const { gm, io, roomId } = await setupRoom();
    setStorage('users.json', [{ id: 'A', username: 'Alice', chips: 10_000, avatarSeed: 'av-07' }]);
    const sock = io.addSocket('A', 'Alice', roomId);
    gm.addPlayer(roomId, 'A', sock.id, 'Alice', 1000);

    const player = getState(gm, roomId).players.find((p) => p.id === 'A');
    expect(player?.avatar).toBe('av-07');
  });

  it('avatarSeed не задан — player.avatar остаётся пустым (клиент фоллбэкается на id)', async () => {
    const { gm, io, roomId } = await setupRoom();
    setStorage('users.json', [{ id: 'A', username: 'Alice', chips: 10_000 }]);
    const sock = io.addSocket('A', 'Alice', roomId);
    gm.addPlayer(roomId, 'A', sock.id, 'Alice', 1000);

    const player = getState(gm, roomId).players.find((p) => p.id === 'A');
    expect(player?.avatar).toBe('');
  });
});

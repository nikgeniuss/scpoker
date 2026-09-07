import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import type { GameManager } from '../GameManager.js';
import type { Server } from 'socket.io';

// Без рэтхола (ROADMAP §10.6): ушёл со стола с выигрышем — вернуться за ЭТОТ стол в течение окна
// можно только со стеком не меньше того, с которым ушёл. Здесь проверяется поведение стола;
// чистая арифметика правила покрыта в ratholeService.test.ts.

async function setupRoom(noRatholeHours?: number) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'RatholeRoom',
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 10,   // минимум 100
      buyInMaxBb: 200,  // максимум 2000
      noRatholeHours,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  return { gm, io, roomId: create.roomId };
}

// A уходит со стеком 1000; B остаётся за столом — уход ПОСЛЕДНЕГО игрока закрывает стол,
// и тогда canJoinRoom вернул бы 'not-found', так и не дойдя до правила.
function seatAndLeave(gm: GameManager, io: Server, roomId: string, leaveWithChips = 1000): void {
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 500 });
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
  if (leaveWithChips !== 1000) {
    const rooms = (gm as unknown as { rooms: Map<string, { players: Map<string, { chips: number }> }> }).rooms;
    rooms.get(roomId)!.players.get('A')!.chips = leaveWithChips;
  }
  gm.removePlayer(roomId, 'A');
}

describe('GameManager — без рэтхола (§10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('опция выключена — уход с крупным стеком ничего не ограничивает и записей не пишет', async () => {
    const { gm, io, roomId } = await setupRoom();
    seatAndLeave(gm, io, roomId);
    expect(gm.canJoinRoom(roomId, 'A', undefined, 100)).toBeNull();
    expect(getStorage('rathole.json')).toBeUndefined(); // файл не заводится вовсе
  });

  it('ушёл с крупным стеком — вход минимальным бай-ином отклонён', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    expect(gm.canJoinRoom(roomId, 'A', undefined, 100)).toBe('rathole-min-buyin');
  });

  it('вход со стеком ухода разрешён', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    expect(gm.canJoinRoom(roomId, 'A', undefined, 1000)).toBeNull();
  });

  it('сервер сообщает конкретную требуемую сумму — игроку есть что показать', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    expect(gm.ratholeRequiredFor(roomId, 'A')).toBe(1000);
  });

  it('правило действует на СВОЁМ столе, соседний стол не трогает', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    const other = gm.createRoom(
      { name: 'Other', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 10, buyInMaxBb: 200, noRatholeHours: 6 },
      'system',
    );
    if ('error' in other) throw new Error(other.error);
    seatAndLeave(gm, io, roomId);
    expect(gm.canJoinRoom(other.roomId, 'A', undefined, 100)).toBeNull();
  });

  it('проигравший ушёл с малым стеком — садится обычным минимальным бай-ином', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId, 40);
    expect(gm.canJoinRoom(roomId, 'A', undefined, 100)).toBeNull();
    expect(gm.ratholeRequiredFor(roomId, 'A')).toBe(0);
  });

  it('после истечения окна ограничение снимается', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    vi.advanceTimersByTime(6 * 3_600_000 + 1_000);
    expect(gm.canJoinRoom(roomId, 'A', undefined, 100)).toBeNull();
  });

  it('addPlayer не пускает мимо проверки (авто-посадка из очереди тоже под правилом)', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    expect(gm.addPlayer(roomId, 'A', 'sock-A', 'A', 100)).toBe(false);
    expect(gm.addPlayer(roomId, 'A', 'sock-A', 'A', 1000)).toBe(true);
  });

  it('севший заново игрок больше не ограничен прошлой записью', async () => {
    const { gm, io, roomId } = await setupRoom(6);
    seatAndLeave(gm, io, roomId);
    expect(gm.addPlayer(roomId, 'A', 'sock-A', 'A', 1000)).toBe(true);
    expect(gm.ratholeRequiredFor(roomId, 'A')).toBe(0);
  });
});

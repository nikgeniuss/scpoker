import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';
import { FREEZE_THRESHOLD_MS } from '../tableWatchdog.js';

// Watchdog зависших столов (ROADMAP): если дедлайн собственного таймера сервера (ход/таймбанк/
// шоудаун) просрочен больше FREEZE_THRESHOLD_MS, значит callback, который должен был продвинуть
// раздачу, не сработал. Здесь это симулируется напрямую — мутируем turnEndsAt в прошлое, как если
// бы реальный setTimeout «потерялся» (баг), и проверяем, что startTableWatchdog() сам себя чинит.

type RoomLike = { turnEndsAt: number | null; phase: string; status: string };
type WatchdogGM = GameManagerLike & {
  startTableWatchdog(intervalMs?: number): void;
  rooms: Map<string, RoomLike>;
};

function makeDeck() {
  return buildDeck(card('A', 's'), card('A', 'h'), card('K', 's'), card('K', 'h'));
}

describe('Watchdog зависших столов — интеграция с GameManager', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('просроченный turnEndsAt без реального таймера — watchdog заново взводит ход', async () => {
    const { gm, io } = await createTestGameManager();
    const create = gm.createRoom(
      { name: 'WatchdogRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100 },
      'sys',
    ) as { roomId: string };
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
    gm.startGame(roomId, makeDeck());

    const wgm = gm as unknown as WatchdogGM;
    const room = wgm.rooms.get(roomId)!;
    expect(room.turnEndsAt).not.toBeNull(); // ход взведён нормальным путём при старте раздачи

    // Симулируем баг: дедлайн остался в прошлом, как если бы реальный setTimeout пропал
    // (исключение где-то по пути) и больше не выстрелит сам.
    const buggyDeadline = Date.now() - (FREEZE_THRESHOLD_MS + 1000);
    room.turnEndsAt = buggyDeadline;

    wgm.startTableWatchdog(5_000);
    vi.advanceTimersByTime(5_001);

    const after = wgm.rooms.get(roomId)!;
    expect(after.turnEndsAt).not.toBeNull();
    expect(after.turnEndsAt as number).toBeGreaterThan(buggyDeadline);
    expect(after.status).toBe('playing'); // раздача продолжилась, а не сброшена
  });

  it('легитимно долгий ход (дедлайн в будущем) — watchdog не трогает стол', async () => {
    const { gm, io } = await createTestGameManager();
    const create = gm.createRoom(
      { name: 'SlowThinkRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 20, buyInMaxBb: 100 },
      'sys',
    ) as { roomId: string };
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
    gm.startGame(roomId, makeDeck());

    const wgm = gm as unknown as WatchdogGM;
    const room = wgm.rooms.get(roomId)!;
    const legitDeadline = Date.now() + 10 * 60_000; // игрок думает с большим таймбанком
    room.turnEndsAt = legitDeadline;

    wgm.startTableWatchdog(5_000);
    vi.advanceTimersByTime(5_001);

    expect(wgm.rooms.get(roomId)!.turnEndsAt).toBe(legitDeadline); // не тронуто
  });
});

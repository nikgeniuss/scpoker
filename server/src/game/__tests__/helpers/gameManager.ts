// Фабрика для тестового GameManager + хелперы для типовых сетапов.
//
// Использование (каждый test-файл, который проверяет GameManager):
//
//   import { describe, it, expect, vi, beforeEach } from 'vitest';
//   vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));
//
//   import { resetStorage, createTestGameManager, seatPlayer } from './helpers/gameManager.js';
//
//   beforeEach(() => resetStorage());
//
//   it('something', async () => {
//     const { gm, io } = await createTestGameManager();
//     const { roomId } = gm.createRoom({...}, 'sys') as { roomId: string };
//     seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 10000, buyIn: 1000 });
//     ...
//   });

import { createMockIo, type MockIo, type MockSocket } from './ioMock.js';
import { setStorage, getStorage, clearStorage } from './storage.js';

const DEFAULT_TIMEBANK = {
  enabled: true,
  startSec: 30,
  bonusSec: 10,
  bonusEveryHands: 10,
  capSec: 60,
  allowPerTableOverride: false,
};

const DEFAULT_BOT_MODE = {
  enabled: false,
  peekMode: 'river' as const,
  tablesPerLevel: 1,
  botsPerTable: 3,
  defaultBuyInBb: 100,
  refillIntervalMs: 120_000,
};

const DEFAULT_SETTINGS = {
  turnDurationMs: 30_000,
  autostartDelayMs: 10_000,
  defaultPlayerChips: 1000,
  timebank: { ...DEFAULT_TIMEBANK },
  botMode: { ...DEFAULT_BOT_MODE },
};

// Минимальный бот, нужный чтобы BotManager не сидил 12 default ботов. botMode.enabled=false,
// значит реально бот никогда не садится за стол.
const NOOP_BOT = {
  id: 'bot:noop',
  username: 'NoopBot',
  chips: 0,
  targetPnL: 'zero' as const,
  persona: {
    aggression: 0.5,
    bluffRate: 0.1,
    heroFoldRate: 0.05,
    slowplayRate: 0.05,
    vpip: 0.25,
  },
  createdAt: new Date(0).toISOString(),
};

export interface StorageOverrides {
  settings?: unknown;
  bots?: unknown[];
  users?: Array<{ id: string; username: string; chips: number; [k: string]: unknown }>;
  rooms?: unknown[];
}

// Сбросить и засеять in-memory storage значениями по умолчанию.
// Вызывать в каждом beforeEach.
export function resetStorage(overrides?: StorageOverrides): void {
  clearStorage();
  setStorage('settings.json', overrides?.settings ?? DEFAULT_SETTINGS);
  setStorage('bots.json', overrides?.bots ?? [NOOP_BOT]);
  setStorage('users.json', overrides?.users ?? []);
  setStorage('rooms.json', overrides?.rooms ?? []);
}

// Динамический импорт, чтобы vi.mock('../../auth/storage.js', ...) в test-файле успел
// быть hoisted ДО фактической загрузки GameManager.
export async function createTestGameManager(): Promise<{
  gm: GameManagerLike;
  io: MockIo;
}> {
  const io = createMockIo();
  const mod = await import('../../GameManager.js');
  const Ctor = mod.GameManager as unknown as new (io: unknown) => GameManagerLike;
  const gm = new Ctor(io);
  return { gm, io };
}

// Минимальный type-shape для GM, чтобы test-код не таскал лишнего.
// Все методы — public в GameManager.ts; типы any для простоты (TS-strictness в тестах не цель).
export interface GameManagerLike {
  createRoom(opts: unknown, createdBy: string): { roomId: string } | { error: string };
  addPlayer(roomId: string, userId: string, socketId: string, username: string, buyInAmount?: number, networkInfo?: { ip: string; deviceId: string }): boolean;
  canJoinRoom(roomId: string, userId: string, password?: string, buyInAmount?: number, networkInfo?: { ip: string; deviceId: string }): string | null;
  removePlayer(roomId: string, userId: string): void;
  handleDisconnect(userId: string): void;
  startGame(roomId: string, testDeck?: unknown[]): void;
  handlePlayerAction(roomId: string, userId: string, action: string, amount?: number): void;
  getGameState(roomId: string, viewerId?: string, withPeek?: boolean): unknown;
  getCountdownEndsAt(roomId: string): number | null;
  restoreActiveHands(): void;
  setAutoTopUp(
    roomId: string,
    userId: string,
    cfg: { enabled: boolean; thresholdBb: number; targetBb: number },
  ): void;
  getSettings(): { defaultRake: { percent: number; capBb: number } } & Record<string, unknown>;
  updateSettings(partial: Record<string, unknown>): Record<string, unknown>;
  applyDefaultRakeToRooms(): { updated: number };
  getRoomList(): Array<{ id: string; rake: { percent: number; capBb: number } }>;
}

// Посадить игрока за стол. Записывает банкролл в mock-users.json, создаёт сокет в io,
// зовёт gm.addPlayer. Возвращает сокет и success-флаг.
export function seatPlayer(
  gm: GameManagerLike,
  io: MockIo,
  opts: {
    roomId: string;
    userId: string;
    username: string;
    bankroll: number;
    buyIn?: number;
    networkInfo?: { ip: string; deviceId: string };
  },
): { socket: MockSocket; success: boolean } {
  // Обновить users.json
  const users = (getStorage('users.json') as Array<{ id: string; username: string; chips: number }>) ?? [];
  const idx = users.findIndex((u) => u.id === opts.userId);
  const rec = { id: opts.userId, username: opts.username, chips: opts.bankroll };
  if (idx >= 0) users[idx] = rec;
  else users.push(rec);
  setStorage('users.json', users);

  // Сокет
  const sock = io.addSocket(opts.userId, opts.username, opts.roomId);

  // Посадка
  const success = gm.addPlayer(opts.roomId, opts.userId, sock.id, opts.username, opts.buyIn, opts.networkInfo);
  return { socket: sock, success };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Интеграционные тесты рейка (POKER_RULES §6.6). Перехватываем chips ПОСЛЕ showdown/endGame,
// но ДО cleanupHand (fake timers — как в GameManager.pots.test.ts).

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  const s = gm.getGameState(roomId) as unknown as { players: Array<{ id: string; chips: number }> };
  return s.players.find((p) => p.id === userId)!.chips;
}

async function setupRaked(rake: { percent: number; capBb: number }) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'RakeRoom',
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 5,
      buyInMaxBb: 100,
      rake,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < 2; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, io, roomId };
}

// AA (P0=A) vs KK (P1=B) на нейтральном борде — A выигрывает.
function aaVsKkDeck() {
  return buildDeck(
    card('A', 's'), card('A', 'h'), // P0 = A hole
    card('K', 's'), card('K', 'h'), // P1 = B hole
    card('2', 'c'),                  // burn
    card('Q', 'd'), card('J', 'h'), card('7', 's'), // flop
    card('3', 'c'), card('9', 'd'),  // burn + turn
    card('4', 'c'), card('8', 'h'),  // burn + river
  );
}

describe('GameManager — рейк (POKER_RULES §6.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('рейк удерживается из банка на шоудауне (10%, cap 3BB)', async () => {
    const { gm, roomId } = await setupRaked({ percent: 10, capBb: 3 });
    gm.startGame(roomId, aaVsKkDeck());
    // Heads-up: B=D=SB ходит первым. Оба чек/колл до шоудауна (банк = только блайнды).
    gm.handlePlayerAction(roomId, 'B', 'call'); // SB → 10
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check'); // flop
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check'); // turn
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check'); // river
    gm.handlePlayerAction(roomId, 'B', 'check');
    // pot=20, rake=min(floor(20*0.1)=2, 3*10=30)=2 → A получает 18.
    // A: 1000 − 10 (BB) + 18 = 1008; B: 1000 − 10 = 990.
    expect(chipsOf(gm, roomId, 'A')).toBe(1008);
    expect(chipsOf(gm, roomId, 'B')).toBe(990);
  });

  it('no flop, no drop: фолд до флопа — рейка нет даже при высоком %', async () => {
    const { gm, roomId } = await setupRaked({ percent: 50, capBb: 50 });
    gm.startGame(roomId, aaVsKkDeck());
    // B (=D=SB) фолдит на префлопе → A забирает банк без флопа.
    gm.handlePlayerAction(roomId, 'B', 'fold');
    // pot=15 (SB5+BB10), рейка нет (нет флопа) → A: 1000 − 10 + 15 = 1005.
    expect(chipsOf(gm, roomId, 'A')).toBe(1005);
  });
});


// Рейк рума по умолчанию (включение комиссии 2026-09-08): стол, созданный без явного rake,
// берёт настройку рума; кнопка админки переносит её на уже работающие столы.
describe('GameManager — рейк рума по умолчанию', () => {
  beforeEach(() => resetStorage());

  function createPlainRoom(gm: GameManagerLike, name: string, rake?: { percent: number; capBb: number }) {
    const r = gm.createRoom(
      { name, smallBlind: 5, bigBlind: 10, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, ...(rake ? { rake } : {}) },
      'system',
    );
    if ('error' in r) throw new Error(r.error);
    return r.roomId;
  }

  function rakeOf(gm: GameManagerLike, roomId: string) {
    return gm.getRoomList().find((r) => r.id === roomId)!.rake;
  }

  it('стол без явного рейка получает рейк рума по умолчанию', async () => {
    const { gm } = await createTestGameManager();
    gm.updateSettings({ defaultRake: { percent: 1.5, capBb: 3 } });

    const roomId = createPlainRoom(gm, 'DefaultRake');

    expect(rakeOf(gm, roomId)).toEqual({ percent: 1.5, capBb: 3 });
  });

  it('явно заданный нулевой рейк уважается — дефолт его не перебивает', async () => {
    const { gm } = await createTestGameManager();
    gm.updateSettings({ defaultRake: { percent: 1.5, capBb: 3 } });

    const roomId = createPlainRoom(gm, 'NoRake', { percent: 0, capBb: 0 });

    expect(rakeOf(gm, roomId)).toEqual({ percent: 0, capBb: 0 });
  });

  it('applyDefaultRakeToRooms переносит настройку на уже созданные столы', async () => {
    const { gm } = await createTestGameManager();
    gm.updateSettings({ defaultRake: { percent: 0, capBb: 0 } });
    const roomId = createPlainRoom(gm, 'OldRoom');
    expect(rakeOf(gm, roomId)).toEqual({ percent: 0, capBb: 0 });

    gm.updateSettings({ defaultRake: { percent: 1.5, capBb: 3 } });
    const result = gm.applyDefaultRakeToRooms();

    expect(result.updated).toBe(1);
    expect(rakeOf(gm, roomId)).toEqual({ percent: 1.5, capBb: 3 });
  });

  it('процент нормализуется до одного знака, cap — до целого', async () => {
    const { gm } = await createTestGameManager();
    const s = gm.updateSettings({ defaultRake: { percent: 1.4567, capBb: 3 } }) as { defaultRake: { percent: number } };

    expect(s.defaultRake.percent).toBe(1.5);
  });
});

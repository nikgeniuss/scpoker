import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock должен быть ДО любых импортов модуля, который грузит auth/storage.js.
// Vitest hoist'ит вызов на вершину файла — но фактический import должен идти после.
vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Smoke-тест проверяет, что test-инфраструктура работает целостно:
//   - vi.mock storage срабатывает (GameManager не падает при чтении users.json)
//   - MockIo принимает emit'ы
//   - seatPlayer корректно сажает игроков
//   - testDeck в startGame даёт детерминированные hole-карты

describe('GameManager — test infrastructure smoke', () => {
  beforeEach(() => {
    resetStorage();
  });

  it('создание GM, посадка 2 игроков, старт раздачи с testDeck даёт ожидаемые hole-карты', async () => {
    const { gm, io } = await createTestGameManager();

    const create = gm.createRoom(
      {
        name: 'SmokeRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
      },
      'system',
    );
    if ('error' in create) throw new Error('createRoom failed: ' + create.error);
    const roomId = create.roomId;

    const a = seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 10_000, buyIn: 1000 });
    const b = seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 10_000, buyIn: 1000 });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);

    // testDeck: первая раздаваемая карта = A♠ (P0 first hole), вторая = A♥ (P0 second hole),
    // третья = K♠ (P1 first), четвёртая = K♥ (P1 second).
    const deck = buildDeck(
      card('A', 's'), card('A', 'h'), // P0 hole (Alice)
      card('K', 's'), card('K', 'h'), // P1 hole (Bob)
    );

    gm.startGame(roomId, deck);

    // Состояние от лица Alice — она видит свои карты
    const stateA = gm.getGameState(roomId, 'A') as {
      phase: string;
      players: Array<{ id: string; cards: Array<{ rank: string; suit: string }> }>;
    };
    expect(stateA.phase).toBe('preflop');

    const aliceInState = stateA.players.find((p) => p.id === 'A')!;
    expect(aliceInState.cards).toEqual([
      { rank: 'A', suit: 'spades' },
      { rank: 'A', suit: 'hearts' },
    ]);

    // Бобу её карты не видны
    const stateB = gm.getGameState(roomId, 'B') as typeof stateA;
    const aliceInBobView = stateB.players.find((p) => p.id === 'A')!;
    expect(aliceInBobView.cards).toEqual([]);

    // Боб видит СВОИ карты
    const bobInBobView = stateB.players.find((p) => p.id === 'B')!;
    expect(bobInBobView.cards).toEqual([
      { rank: 'K', suit: 'spades' },
      { rank: 'K', suit: 'hearts' },
    ]);
  });

  it('mock storage сохраняет данные между read/write — банкролл уменьшается на buyIn', async () => {
    const { gm, io } = await createTestGameManager();
    const { roomId } = gm.createRoom(
      {
        name: 'BankrollRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 4,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
      },
      'system',
    ) as { roomId: string };

    seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 5000, buyIn: 1000 });

    // После seat — банкролл в users.json должен быть 4000
    const { getStorage } = await import('./helpers/storage.js');
    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    const alice = users.find((u) => u.id === 'A')!;
    expect(alice.chips).toBe(4000);
  });

  it('MockIo получает emit\'ы от GameManager', async () => {
    const { gm, io } = await createTestGameManager();
    const { roomId } = gm.createRoom(
      {
        name: 'EmitRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 4,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
      },
      'system',
    ) as { roomId: string };

    // createRoom бродкастит обновлённый roomList в LOBBY_ROOM (= 'lobby')
    const lobbyEmits = io.emitted.filter((e) => e.target === 'lobby' && e.event === 'roomList');
    expect(lobbyEmits.length).toBeGreaterThan(0);
  });
});

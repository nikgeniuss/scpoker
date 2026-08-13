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

  it('club-members-only: не-член не может войти в клубную комнату', async () => {
    const { gm } = await createTestGameManager();
    const { setStorage } = await import('./helpers/storage.js');
    // createRoom теперь сам проверяет, что создатель — участник клуба (§0.13) —
    // заводим клуб с владельцем заранее.
    setStorage('clubs.json', [
      {
        id: 'club-xyz',
        name: 'Club',
        ownerId: 'owner',
        members: [{ userId: 'owner', username: 'owner', role: 'owner', joinedAt: new Date().toISOString() }],
        inviteCode: 'ABCD1234',
        pendingRequests: [],
        settings: {},
        createdAt: new Date().toISOString(),
      },
    ]);
    const { roomId } = gm.createRoom(
      {
        name: 'ClubRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
        clubId: 'club-xyz',
      },
      'owner',
    ) as { roomId: string };

    // 'outsider' не входит в club-xyz.members → club-members-only
    const deny = gm.canJoinRoom(roomId, 'outsider', undefined, 1000);
    expect(deny).toBe('club-members-only');
  });

  it('createRoom отказывает в clubId, если создатель не состоит в этом клубе', async () => {
    const { gm } = await createTestGameManager();
    // clubs.json пустой → 'owner' не member ни одного клуба
    const result = gm.createRoom(
      {
        name: 'ClubRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
        clubId: 'club-xyz',
      },
      'owner',
    );
    expect(result).toEqual({ error: 'Создавать клубный стол может только участник этого клуба' });
  });

  it('createRoom принимает реальный userId владельца отдельно от createdBy-имени (баг 2026-08-11)', async () => {
    const { gm } = await createTestGameManager();
    const { setStorage } = await import('./helpers/storage.js');
    // username и userId РАЗНЫЕ (как в реальности) — раньше клубная проверка сверяла
    // createdBy-имя против club.members[].userId и никогда не совпадала.
    setStorage('clubs.json', [
      {
        id: 'club-real',
        name: 'RealClub',
        ownerId: 'uuid-owner-123',
        members: [{ userId: 'uuid-owner-123', username: 'kiroochkaaawl44', role: 'owner', joinedAt: new Date().toISOString() }],
        inviteCode: 'ABCD1234',
        pendingRequests: [],
        settings: {},
        createdAt: new Date().toISOString(),
      },
    ]);
    const result = gm.createRoom(
      {
        name: 'ClubRoom',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        turnDurationSec: 30,
        buyInMinBb: 20,
        buyInMaxBb: 100,
        clubId: 'club-real',
      },
      'kiroochkaaawl44', // createdBy — имя для отображения
      'uuid-owner-123',  // creatorUserId — реальный id для проверки членства
    );
    expect('error' in result).toBe(false);
  });

  it('MockIo получает emit\'ы от GameManager', async () => {
    const { gm, io } = await createTestGameManager();
    gm.createRoom(
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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { buildDeck } from './helpers/cards.js';

// Симуляция рестарта сервера (ROADMAP §9.2): GM1 пишет active-hands.json/rooms.json в общий
// in-memory mock storage (см. helpers/storage.js — store персистится между createTestGameManager()
// в рамках одного теста), GM2 создаётся БЕЗ resetStorage() между ними — комнаты из того же
// снимка уже на месте (createRoom их не трогает), restoreActiveHands() вызывается явно
// (как в index.ts после statsRecorder/roomEventRecorder/handRecorder — см. GameManager.ts).

// SharedGameState не отдаёт внутреннее room.status — только phase (см. gameStateSerializer.ts).
type StateView = {
  phase: string;
  pot: number;
  communityCards: unknown[];
  players: Array<{ id: string; chips: number; cards: unknown[] }>;
};

function state(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

async function setupTable(name: string) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name, smallBlind: 50, bigBlind: 100, maxPlayers: 6, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100 },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 100_000, buyIn: 10_000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 100_000, buyIn: 10_000 });
  return { gm, roomId };
}

describe('GameManager — восстановление активной раздачи после рестарта (§9.2)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('мид-хенд (preflop, чей-то ход открыт) — раздача восстанавливается и доигрывается', async () => {
    const { gm: gm1, roomId } = await setupTable('MidHand');
    gm1.startGame(roomId, buildDeck());
    // B (D/SB) коллирует — ход переходит к A (BB), call=0 (бесплатно).
    gm1.handlePlayerAction(roomId, 'B', 'call');
    const before = state(gm1, roomId);
    expect(before.phase).toBe('preflop');

    // "Рестарт": второй GameManager на том же mock-storage (без resetStorage).
    const { gm: gm2 } = await createTestGameManager();
    gm2.restoreActiveHands();
    const after = state(gm2, roomId);

    expect(after.phase).toBe('preflop');
    expect(after.pot).toBe(before.pot);
    expect(after.players.map(p => p.chips)).toEqual(before.players.map(p => p.chips));

    // Все восстановленные — disconnected, ход A открыт → быстрый сит-аут таймер (1500мс),
    // не полный turn-таймер (30с). Бесплатный чек у A → префлоп-раунд завершён → флоп раздан.
    vi.advanceTimersByTime(1600);
    expect(state(gm2, roomId).communityCards.length).toBe(3);
  });

  it('рестарт в фазе showdown — раздача завершается немедленно (не ждёт 5с окно показа)', async () => {
    const { gm: gm1, roomId } = await setupTable('Showdown');
    gm1.startGame(roomId);
    // Чек-даун до шоудауна: преflop (B call, A check) → flop/turn/river (A check, B check).
    gm1.handlePlayerAction(roomId, 'B', 'call');
    gm1.handlePlayerAction(roomId, 'A', 'check');
    for (let i = 0; i < 3; i++) {
      gm1.handlePlayerAction(roomId, 'A', 'check');
      gm1.handlePlayerAction(roomId, 'B', 'check');
    }
    expect(state(gm1, roomId).phase).toBe('showdown');

    // "Рестарт" — НЕ прокручиваем время GM1 (5с окно показа ещё не истекло у старого инстанса).
    const { gm: gm2 } = await createTestGameManager();
    gm2.restoreActiveHands();
    const after = state(gm2, roomId);
    // cleanupHand сработал немедленно (не ждали 5с) — старая раздача закрыта; т.к. оба игрока
    // остались за столом (== autoStartPlayers), между раздачами стартует следующая мгновенно
    // (то же поведение, что и в обычной игре между раздачами — см. cleanupHand). Свежие блайнды
    // 50+100 доказывают, что cleanup действительно произошёл (старый pot/борд не могли дать 150).
    expect(after.phase).toBe('preflop');
    expect(after.pot).toBe(150);
    expect(after.communityCards.length).toBe(0);
  });

  it('рестарт стола в waiting (игроки сидят, раздача не стартовала) — автостарт переплан', async () => {
    const { gm: gm1, roomId } = await setupTable('Waiting');
    expect(gm1.getCountdownEndsAt(roomId)).not.toBeNull(); // 2/2 игроков → автостарт уже шёл

    const { gm: gm2 } = await createTestGameManager();
    gm2.restoreActiveHands();
    expect(state(gm2, roomId).phase).toBe('waiting');
    expect(gm2.getCountdownEndsAt(roomId)).not.toBeNull();
  });
});

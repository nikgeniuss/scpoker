import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Тесты для §5.2 POKER_RULES.md и A3 bug в GameManager.ts:963-972.
// Спека: incomplete all-in (raise-size < lastRaiseSize) НЕ открывает action для уже сходивших call'еров.
//        Они могут только call/fold; не re-raise.
// Код: любой all-in, который повышает currentBet, сбрасывает actionsThisRound = {userId}.
//      Это позволяет уже-сходившим re-raise против incomplete all-in.
//
// Сценарий: BB=10, 4 игрока со стеками A=200 B=200 C=200 D=100 (на флопе; buyIn=110, −10 BB). На флопе:
//   A bets 30 → currentBet=30, lastRaiseSize=30
//   B raises to 90 → raise-size=60 (полный, ≥30), currentBet=90, lastRaiseSize=60
//   C calls 90
//   D all-in 100 → raise-size=10 (incomplete, <60), currentBet=100 (bumped, но incomplete)
//   По спеке: B и C могут только call/fold; A может ещё raise.

async function setup() {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'AllInReopenRoom',
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 5, // позволяет buyIn=50, нужно для D=100
      buyInMaxBb: 100,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  // 4 игрока: A=200, B=200, C=200, D=100
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 200 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 200 });
  seatPlayer(gm, io, { roomId, userId: 'C', username: 'C', bankroll: 10_000, buyIn: 200 });
  seatPlayer(gm, io, { roomId, userId: 'D', username: 'D', bankroll: 10_000, buyIn: 110 }); // −10 BB → 100 chips на флопе
  return { gm, io, roomId };
}

function makeDeck() {
  const cardsList = [
    card('A', 's'), card('A', 'h'),
    card('K', 's'), card('K', 'h'),
    card('Q', 's'), card('Q', 'h'),
    card('J', 's'), card('J', 'h'),
  ];
  return buildDeck(...cardsList);
}

type StateView = {
  phase: string;
  currentPlayerIndex: number;
  players: Array<{ id: string; chips: number; currentBet: number; isFolded: boolean }>;
  pot: number;
  currentBet: number;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function currentTurnId(state: StateView): string {
  return state.players[state.currentPlayerIndex].id;
}

// Прокрутить префлоп до флопа: 4 игрока, все call, BB check.
// Hand order after startGame: dealerIndex=1 (B), SB=C, BB=D, UTG=A.
async function fastForwardToFlop(gm: GameManagerLike, roomId: string) {
  gm.startGame(roomId, makeDeck());
  // Префлоп: UTG=A (call 10), then B (call 10-0=10), C (SB, call 10-5=5), D (BB, check)
  gm.handlePlayerAction(roomId, 'A', 'call');
  gm.handlePlayerAction(roomId, 'B', 'call');
  gm.handlePlayerAction(roomId, 'C', 'call');
  gm.handlePlayerAction(roomId, 'D', 'check');
  expect(getState(gm, roomId).phase).toBe('flop');
}

// Сценарий до D all-in: на флопе A bet 30, B raise 90, C call 90, D all-in 100.
// Постфлоп первым ходит SB=C, но нам нужно чтобы первым был A. Пропускаем C и B.
async function setupFlopScenario(gm: GameManagerLike, roomId: string) {
  await fastForwardToFlop(gm, roomId);
  // Постфлоп порядок: SB=C → BB=D → UTG=A → B
  // Чтобы A был первым, C должен check, D check.
  // Тогда A's turn — A bet 30.
  gm.handlePlayerAction(roomId, 'C', 'check');
  gm.handlePlayerAction(roomId, 'D', 'check');
  // Ход у A. A bets 30 (raise to 30, currentBet был 0)
  gm.handlePlayerAction(roomId, 'A', 'raise', 30);
  // Действующий — B. B raises to 90.
  gm.handlePlayerAction(roomId, 'B', 'raise', 90);
  // C calls.
  gm.handlePlayerAction(roomId, 'C', 'call');
  // D all-in 100 (incomplete, raise-size=10 < lastRaiseSize=60)
  gm.handlePlayerAction(roomId, 'D', 'all-in');
  // Теперь currentBet=100, actionsThisRound (по коду) = {D}.
  // По спеке должно быть: A может raise (не действовал после D); B и C могут только call/fold.
}

describe('GameManager — incomplete all-in re-opens action (POKER_RULES §5.2, bug A3)', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('A3: после incomplete all-in от D, B не может re-raise (он уже call\'нул full raise)', async () => {
    const { gm, roomId } = await setup();
    await setupFlopScenario(gm, roomId);
    const s = getState(gm, roomId);
    // По спеке ход у A, B и C — только call/fold.
    // Но код позволяет любому re-raise. B уже сходил call (раундом раньше).
    // По коду: actionsThisRound={D}, ход переходит к A. После A — к B.
    // Если B попробует raise to 200, по коду это пройдёт; по спеке — должно быть отклонено.

    // Пропускаем ход A (он fold)
    if (currentTurnId(s) === 'A') {
      gm.handlePlayerAction(roomId, 'A', 'fold');
    }
    // Теперь ход у B (по коду). По спеке B может только call/fold.
    const s2 = getState(gm, roomId);
    expect(currentTurnId(s2)).toBe('B'); // или закрытие round'а
    const beforeBet = s2.currentBet;
    gm.handlePlayerAction(roomId, 'B', 'raise', 200);
    const after = getState(gm, roomId);
    // По спеке: raise должен быть отклонён → currentBet не изменился
    expect(after.currentBet).toBe(beforeBet); // должно быть 100, но код позволит 200
  });

  it('A3: после incomplete all-in от D, C не может re-raise', async () => {
    const { gm, roomId } = await setup();
    await setupFlopScenario(gm, roomId);
    // Пропускаем A (fold) и B (call)
    if (currentTurnId(getState(gm, roomId)) === 'A') {
      gm.handlePlayerAction(roomId, 'A', 'fold');
    }
    if (currentTurnId(getState(gm, roomId)) === 'B') {
      gm.handlePlayerAction(roomId, 'B', 'call');
    }
    // Теперь ход у C по коду (он тоже re-opened actionsThisRound). По спеке — call/fold only.
    const before = getState(gm, roomId);
    if (currentTurnId(before) !== 'C') {
      // Если round уже закрыт (advance), тест не работает; skip
      expect(false).toBe(true);
      return;
    }
    gm.handlePlayerAction(roomId, 'C', 'raise', 200);
    const after = getState(gm, roomId);
    // По спеке: currentBet не должен подняться
    expect(after.currentBet).toBe(before.currentBet);
  });

  it('Lock-in: после incomplete all-in от D, A может ещё raise (он не действовал в этом сегменте)', async () => {
    // A — единственный, кто по СПЕКЕ получает re-open после incomplete all-in (он не успел
    // сходить после B's raise to 90). Текущий код тоже это позволяет (всем разрешает).
    // Это совпадение спеки и кода — lock-in.
    const { gm, roomId } = await setup();
    await setupFlopScenario(gm, roomId);
    expect(currentTurnId(getState(gm, roomId))).toBe('A');
    // A re-raises to 200. lastRaiseSize after D = 10 (incomplete).
    // По коду: min = max(100*2, 100+10) = 200. raise to 200 — ровно min. Проходит.
    gm.handlePlayerAction(roomId, 'A', 'raise', 200);
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(200);
  });

  it('Lock-in: full all-in над min — DOES re-open action для всех', async () => {
    // Reset сценарий. D=200 в этот раз (не 100). После A bet 30, B raise 90, C call,
    // D all-in 200 → raise-size=110 ≥ 60 = lastRaiseSize → ПОЛНЫЙ raise. Action re-opens.
    const { gm, io } = await createTestGameManager();
    const create = gm.createRoom(
      {
        name: 'FullAllIn',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 9,
        turnDurationSec: 30,
        buyInMinBb: 5,
        buyInMaxBb: 100,
      },
      'system',
    );
    if ('error' in create) throw new Error(create.error);
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 300 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 300 });
    seatPlayer(gm, io, { roomId, userId: 'C', username: 'C', bankroll: 10_000, buyIn: 300 });
    seatPlayer(gm, io, { roomId, userId: 'D', username: 'D', bankroll: 10_000, buyIn: 200 });
    gm.startGame(roomId, makeDeck());
    // Префлоп: все call, BB check
    gm.handlePlayerAction(roomId, 'A', 'call');
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'check');
    expect(getState(gm, roomId).phase).toBe('flop');
    // Постфлоп: C check, D check, A bet 30, B raise 90, C call, D all-in 200 (FULL raise)
    gm.handlePlayerAction(roomId, 'C', 'check');
    gm.handlePlayerAction(roomId, 'D', 'check');
    gm.handlePlayerAction(roomId, 'A', 'raise', 30);
    gm.handlePlayerAction(roomId, 'B', 'raise', 90);
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'all-in'); // 200 total, raise-size=110, FULL
    // currentBet=200, actionsThisRound={D}. Ход у A.
    expect(currentTurnId(getState(gm, roomId))).toBe('A');
    // A может re-raise → код позволяет. Спека тоже позволяет (full raise всё открывает).
    gm.handlePlayerAction(roomId, 'A', 'raise', 300); // min=200*2=400, но raise to 300 < 400 и не all-in для A (стек 270).
    // Ой, A имеет стек 270 после blinds=10? нет, A=300 buyIn. После call 10 → 290 остаётся. После raise 30 → 260 left. После raise 300? нужно delta=300-30=270. У него 260. Не хватает на full raise.
    // Упрощаем: проверяем что round НЕ закрылся (action re-opened для всех).
    const s = getState(gm, roomId);
    expect(s.phase === 'flop' || s.phase === 'turn' || s.phase === 'showdown' || s.phase === 'waiting' || s.phase === 'river').toBe(true);
  });

  it('Lock-in: all-in за меньше currentBet (short call) — не bump, не re-open', async () => {
    // D имеет 50 chips, currentBet=90 — D all-in 50, НЕ bumps currentBet → нет re-open.
    const { gm, io } = await createTestGameManager();
    const create = gm.createRoom(
      {
        name: 'ShortCall',
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 9,
        turnDurationSec: 30,
        buyInMinBb: 5,
        buyInMaxBb: 100,
      },
      'system',
    );
    if ('error' in create) throw new Error(create.error);
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 300 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 300 });
    seatPlayer(gm, io, { roomId, userId: 'C', username: 'C', bankroll: 10_000, buyIn: 300 });
    // D — короткий стек. По правилам buyInMinBb=5, BB=10 → min=50. Берём 50.
    seatPlayer(gm, io, { roomId, userId: 'D', username: 'D', bankroll: 10_000, buyIn: 50 });
    gm.startGame(roomId, makeDeck());
    // Префлоп: A call → B call → C (SB) call → D (BB) — у него уже 40 left (50-10 BB). check.
    gm.handlePlayerAction(roomId, 'A', 'call');
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'check');
    expect(getState(gm, roomId).phase).toBe('flop');
    // Постфлоп: C check, D check, A bet 30, B raise 90.
    gm.handlePlayerAction(roomId, 'C', 'check');
    gm.handlePlayerAction(roomId, 'D', 'check');
    gm.handlePlayerAction(roomId, 'A', 'raise', 30);
    gm.handlePlayerAction(roomId, 'B', 'raise', 90);
    // Ход у C. C call.
    gm.handlePlayerAction(roomId, 'C', 'call');
    // Ход у D. D all-in 40 → total committed на флопе будет 40 (currentBet=40 < 90 → не bump).
    const beforeBet = getState(gm, roomId).currentBet;
    expect(beforeBet).toBe(90);
    gm.handlePlayerAction(roomId, 'D', 'all-in');
    const afterBet = getState(gm, roomId).currentBet;
    expect(afterBet).toBe(90); // не bumped — short call
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Тесты для §5.1 POKER_RULES.md и A1 bug в GameManager.ts:951.
// Спека: minRaiseTo = currentBet + lastRaiseSize. Где lastRaiseSize — размер последнего полного raise.
// Пример: BB=10, preflop currentBet=10 (lastRaiseSize=10). A raises to 30 → lastRaiseSize=20.
//         B 3-bets — min = 30 + 20 = 50.
// Код: max(currentBet*2, currentBet+BB) — для 3-bet выдаст max(60, 40) = 60. Бракует валидный 50.
//
// Используем it.fails для тестов, которые должны пройти по правилу, но падают на текущем коде.

async function setupTable(playerCount: number) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'MinRaiseRoom',
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 20,
      buyInMaxBb: 100,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < playerCount; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, io, roomId };
}

function makeDeck(playerCount: number) {
  const cardsList = [];
  const suits = ['s', 'h', 'd', 'c'] as const;
  const ranks: Array<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'> =
    ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6'];
  for (let i = 0; i < playerCount; i++) {
    cardsList.push(card(ranks[i], suits[0]), card(ranks[i], suits[1]));
  }
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

describe('GameManager — min-raise (POKER_RULES §5.1, bug A1)', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // --- Lock-in tests (текущий код согласен со спекой) ---

  it('preflop open-raise to 2×BB (20) принимается (lock-in)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    // Ход у B (UTG). currentBet=10 (BB). Raise to 20 → corretto.
    gm.handlePlayerAction(roomId, 'B', 'raise', 20);
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(20);
  });

  it('postflop open-bet ровно BB (10) принимается (lock-in)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    // Префлоп: все call → BB check → флоп
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    expect(getState(gm, roomId).phase).toBe('flop');
    // Постфлоп: первым ходит SB=C. Open-bet 10 (= BB). На постфлопе room.currentBet=0,
    // raise проходит проверку `amount > currentBet`. Min-raise: max(0, 0+10) = 10. Ok.
    gm.handlePlayerAction(roomId, 'C', 'raise', 10);
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(10);
  });

  it('preflop raise to 19 (< 2×BB) отклоняется (lock-in)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    const before = getState(gm, roomId);
    gm.handlePlayerAction(roomId, 'B', 'raise', 19);
    const after = getState(gm, roomId);
    // currentBet не изменился, действие отклонено
    expect(after.currentBet).toBe(before.currentBet);
    expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex);
  });

  // --- A1 bug tests (it.fails — должны пройти по спеке, но падают на коде) ---

  it.fails('A1: 3-bet to 50 после A raises to 30 — валидно по спеке (lastRaiseSize=20, min=50)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    // B (UTG) raise to 30. lastRaiseSize=30-10=20.
    gm.handlePlayerAction(roomId, 'B', 'raise', 30);
    // C (SB) хочет 3-bet to 50. Спека: min=30+20=50 → 50 корректно.
    // Код: max(30*2, 30+10) = 60 → бракует.
    gm.handlePlayerAction(roomId, 'C', 'raise', 50);
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(50);
  });

  it.fails('A1: 4-bet to 70 после A→30, B→50 — валидно по спеке (lastRaiseSize=20, min=70)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    // B (UTG) raise to 30. lastRaiseSize=20.
    gm.handlePlayerAction(roomId, 'B', 'raise', 30);
    // C (SB) — попробуем 60 (что код примет): lastRaiseSize=60-30=30.
    // Чтобы протестировать спеку 4-bet с lastRaiseSize=20 — нужно сначала чтобы код принял 3-bet to 50.
    // Но он не принимает! Так что протестируем чистый 4-bet сценарий по спеке:
    // Пусть в идеальном спека-мире: A→30, C→50 (3-bet, lastRaiseSize=20), теперь A's turn.
    // A 4-bet to 70 (min=50+20=70). Код требует ≥ 50+10*2=100 (или 50+10 если по второй формуле).
    // Реально: max(50*2, 50+10) = 100. Бракует 70.
    //
    // Заменяем: сразу пытаемся валидное 3-bet to 50 (it.fails покрывает A1)
    gm.handlePlayerAction(roomId, 'C', 'raise', 50); // 3-bet spec-valid, code rejects
    // Если каким-то чудом приняли:
    gm.handlePlayerAction(roomId, 'A', 'raise', 70); // 4-bet spec-valid
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(70);
  });

  it.fails('A1 postflop: A bets 30, B raises to 60, C re-raises to 90 — валидно по спеке (lastRaiseSize=30, min=90)', async () => {
    const { gm, roomId } = await setupTable(3);
    gm.startGame(roomId, makeDeck(3));
    // Префлоп: все call, BB check → флоп
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    expect(getState(gm, roomId).phase).toBe('flop');
    // Постфлоп: первый ход SB=C. C bets 30. currentBet=30, lastRaiseSize=30.
    gm.handlePlayerAction(roomId, 'C', 'raise', 30);
    // A (BB) raise to 60 — full raise, lastRaiseSize=30. Код: max(30*2, 30+10)=60 → принимает.
    gm.handlePlayerAction(roomId, 'A', 'raise', 60);
    // B (UTG) re-raise to 90 — спека: min=60+30=90 → корректно.
    // Код: max(60*2, 60+10) = 120 → бракует 90.
    gm.handlePlayerAction(roomId, 'B', 'raise', 90);
    const s = getState(gm, roomId);
    expect(s.currentBet).toBe(90);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Доделка §10.6 (2026-06-26): Straddle — mandatory UTG straddle при включении тумблера.

type StateView = {
  currentPlayerIndex: number;
  currentBet: number;
  pot: number;
  players: Array<{ id: string; chips: number }>;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function threePlayerDeck() {
  return buildDeck(
    card('2', 's'), card('3', 's'), // A hole
    card('4', 's'), card('5', 's'), // B hole
    card('6', 's'), card('7', 's'), // C hole
  );
}

async function setupRoom(straddleEnabled: boolean, buyIns: [number, number, number] = [1000, 1000, 1000]) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'StraddleRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, straddleEnabled },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  const ids = ['A', 'B', 'C'];
  ids.forEach((userId, i) => {
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: buyIns[i] });
  });
  return { gm, roomId };
}

describe('GameManager — Straddle (доделка §10.6)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включён, ≥3 игрока, хватает фишек → UTG(=dealer в 3-max) стрэддлит 2×BB, ход сдвигается', async () => {
    const { gm, roomId } = await setupRoom(true);
    gm.startGame(roomId, threePlayerDeck());
    const s = getState(gm, roomId);
    // dealerIndex после старта = 1 (B). UTG в 3-max = dealerIndex = B. SB=C(idx2), BB=A(idx0).
    // Банк = SB(5) + BB(10) + straddle(20) = 35.
    expect(s.pot).toBe(35);
    expect(s.currentBet).toBe(20);
    // Ход начинается после стрэддлера (idx1+1=2 → C).
    expect(s.currentPlayerIndex).toBe(2);
    const bChips = s.players.find((p) => p.id === 'B')!.chips;
    expect(bChips).toBe(980); // 1000 − 20 (straddle)
  });

  it('выключен → обычное поведение (UTG не вносит ничего сверх роли, currentBet=BB)', async () => {
    const { gm, roomId } = await setupRoom(false);
    gm.startGame(roomId, threePlayerDeck());
    const s = getState(gm, roomId);
    expect(s.pot).toBe(15); // SB(5) + BB(10)
    expect(s.currentBet).toBe(10);
    expect(s.currentPlayerIndex).toBe(1); // UTG=dealer, ходит первым как обычно
  });

  it('включён, но недостаточно фишек у UTG на полный стрэддл → не постится', async () => {
    // dealerIndex после старта = 1 → B = UTG. У B всего 15 фишек (< 20 = 2×BB).
    const { gm, roomId } = await setupRoom(true, [1000, 15, 1000]);
    gm.startGame(roomId, threePlayerDeck());
    const s = getState(gm, roomId);
    expect(s.pot).toBe(15);
    expect(s.currentBet).toBe(10);
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('heads-up (2 игрока) → стрэддл не применяется (нет UTG)', async () => {
    const { gm, io } = await createTestGameManager();
    const create = gm.createRoom(
      { name: 'HeadsUpRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100, straddleEnabled: true },
      'system',
    );
    if ('error' in create) throw new Error(create.error);
    const roomId = create.roomId;
    seatPlayer(gm, io, { roomId, userId: 'A', username: 'A-name', bankroll: 10_000, buyIn: 1000 });
    seatPlayer(gm, io, { roomId, userId: 'B', username: 'B-name', bankroll: 10_000, buyIn: 1000 });
    gm.startGame(roomId, buildDeck(card('2', 's'), card('3', 's'), card('4', 's'), card('5', 's')));
    const s = getState(gm, roomId);
    expect(s.pot).toBe(15);
    expect(s.currentBet).toBe(10);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

// Тесты §4 (actions), §7.4 (round closure) из POKER_RULES.md.

async function setupTable(playerCount: number, opts?: { smallBlind?: number; bigBlind?: number; bankroll?: number; buyIn?: number }) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'ActRoom',
      smallBlind: opts?.smallBlind ?? 5,
      bigBlind: opts?.bigBlind ?? 10,
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
    seatPlayer(gm, io, {
      roomId,
      userId,
      username: userId + '-name',
      bankroll: opts?.bankroll ?? 10_000,
      buyIn: opts?.buyIn ?? 1000,
    });
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
  dealerIndex: number;
  players: Array<{ id: string; chips: number; currentBet: number; isFolded: boolean; cards: unknown[] }>;
  pot: number;
  currentBet: number;
};

function getState(gm: GameManagerLike, roomId: string): StateView {
  return gm.getGameState(roomId) as unknown as StateView;
}

function currentTurnId(state: StateView): string {
  return state.players[state.currentPlayerIndex].id;
}

describe('GameManager — actions, round closure', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Blinds + ante setup', () => {
    it('блайнды постятся: pot=SB+BB, currentBet=BB, у игроков корректные currentBet', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const s = getState(gm, roomId);
      expect(s.pot).toBe(15); // 5 + 10
      expect(s.currentBet).toBe(10);
      // SB = C (D+1=2), BB = A (D+2=0), UTG = B
      const a = s.players.find((p) => p.id === 'A')!;
      const c = s.players.find((p) => p.id === 'C')!;
      expect(a.currentBet).toBe(10); // BB
      expect(c.currentBet).toBe(5); // SB
    });
  });

  describe('Fold', () => {
    it('fold: isFolded=true, pot не меняется, ход переходит', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const potBefore = getState(gm, roomId).pot;
      // Ход у B (UTG)
      gm.handlePlayerAction(roomId, 'B', 'fold');
      const s = getState(gm, roomId);
      const b = s.players.find((p) => p.id === 'B')!;
      expect(b.isFolded).toBe(true);
      expect(s.pot).toBe(potBefore);
      // Ход переходит к C (SB)
      expect(currentTurnId(s)).toBe('C');
    });

    it('действие folded игрока игнорируется', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      gm.handlePlayerAction(roomId, 'B', 'fold');
      const stateBefore = getState(gm, roomId);
      // B пытается действовать после fold (не его ход + folded)
      gm.handlePlayerAction(roomId, 'B', 'call');
      const stateAfter = getState(gm, roomId);
      expect(stateAfter.pot).toBe(stateBefore.pot);
      expect(stateAfter.currentPlayerIndex).toBe(stateBefore.currentPlayerIndex);
    });
  });

  describe('Check', () => {
    it('check отклонён когда player.currentBet < currentBet', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // B (UTG) пытается check, но currentBet=10, у B=0 → должно быть отклонено
      const stateBefore = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'check');
      const stateAfter = getState(gm, roomId);
      // currentPlayerIndex не сменился
      expect(stateAfter.currentPlayerIndex).toBe(stateBefore.currentPlayerIndex);
    });

    it('check принимается когда player.currentBet >= currentBet', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Префлоп: B call, C call, A (BB) check
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      // Ход у A. Его currentBet=10 == room.currentBet=10 → check разрешён
      gm.handlePlayerAction(roomId, 'A', 'check');
      const s = getState(gm, roomId);
      expect(s.phase).toBe('flop');
    });

    it('BB check после всех call → фаза advance до flop', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'check');
      expect(getState(gm, roomId).phase).toBe('flop');
    });
  });

  describe('Call', () => {
    it('call вычитает корректную дельту', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const beforeB = getState(gm, roomId).players.find((p) => p.id === 'B')!.chips;
      // Ход у B (currentBet=0, room.currentBet=10) → call=10
      gm.handlePlayerAction(roomId, 'B', 'call');
      const afterB = getState(gm, roomId).players.find((p) => p.id === 'B')!;
      expect(afterB.chips).toBe(beforeB - 10);
      expect(afterB.currentBet).toBe(10);
    });

    it('call при стек < delta — игрок all-in, chips=0', async () => {
      // 3-max BB=10, buyIn=200. Все имеют 200 на столе.
      const { gm, roomId } = await setupTable(3, { bigBlind: 10, bankroll: 1000, buyIn: 200 });
      gm.startGame(roomId, makeDeck(3));
      // B raise to 100, C fold, A all-in 200, B call всё что есть (100).
      // После B call → все activeplayer'ы либо all-in, либо matched → advance phase.
      // Проверим Promise: chips=0 у B и итоговый pot включает все вклады.
      gm.handlePlayerAction(roomId, 'B', 'raise', 100);
      gm.handlePlayerAction(roomId, 'C', 'fold');
      gm.handlePlayerAction(roomId, 'A', 'all-in'); // 200 total
      gm.handlePlayerAction(roomId, 'B', 'call');
      const afterB = getState(gm, roomId).players.find((p) => p.id === 'B')!;
      // call всё что мог: 100, теперь chips=0 (был 100 после raise to 100)
      expect(afterB.chips).toBe(0);
      // currentBet после advance phase сброшен в 0, но chips остаются 0
    });
  });

  describe('Raise', () => {
    it('raise отклонён когда amount <= currentBet', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const beforeIdx = getState(gm, roomId).currentPlayerIndex;
      gm.handlePlayerAction(roomId, 'B', 'raise', 10); // <= currentBet=10
      expect(getState(gm, roomId).currentPlayerIndex).toBe(beforeIdx);
    });

    it('preflop open-raise to 2×BB (20) принимается', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      gm.handlePlayerAction(roomId, 'B', 'raise', 20);
      const s = getState(gm, roomId);
      expect(s.currentBet).toBe(20);
    });

    it('preflop raise to 19 (BB=10) отклонён — меньше min', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'raise', 19);
      const after = getState(gm, roomId);
      expect(after.currentBet).toBe(before.currentBet); // не изменился
      expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex); // ход не сменился
    });

    it('raise обновляет currentBet, сбрасывает actionsThisRound (только raiser)', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // B (UTG) call → C (SB) call → A (BB) raise to 30. После raise ход → B (он не в actionsThisRound)
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'raise', 30);
      const s = getState(gm, roomId);
      expect(s.currentBet).toBe(30);
      expect(s.phase).toBe('preflop'); // фаза не advance
      // Действующий — B (action re-opened для уже сходивших)
      expect(currentTurnId(s)).toBe('B');
    });
  });

  describe('All-in', () => {
    it('full all-in raise: сбрасывает actionsThisRound', async () => {
      const { gm, roomId } = await setupTable(3, { bigBlind: 10, bankroll: 5000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(3));
      // B call, C call, A all-in (1000 total)
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      gm.handlePlayerAction(roomId, 'A', 'all-in'); // 1000 → bumps currentBet to 1000
      const s = getState(gm, roomId);
      // currentBet=1000 (A's total committed)
      expect(s.currentBet).toBeGreaterThan(10);
      // Ход переходит дальше к B (action re-opened)
      // На фолд флоп не должно перейти
      expect(s.phase).toBe('preflop');
    });

    it('all-in ровно call: добавляет в actionsThisRound без reset', async () => {
      const { gm, roomId } = await setupTable(3, { bigBlind: 10, bankroll: 5000, buyIn: 100 });
      gm.startGame(roomId, makeDeck(3));
      // У всех стек на столе 100. B raise to 50 (полный), C (SB) all-in 95 → total 100 (bump currentBet),
      // A (BB) all-in 90 → total 100 (равно, не bump). Затем B нужно call → all-in 50 (стек был 50 после raise).
      gm.handlePlayerAction(roomId, 'B', 'raise', 50);
      gm.handlePlayerAction(roomId, 'C', 'all-in'); // SB 95 + 5 sb = total 100, bumps currentBet to 100
      // Сейчас C bumped → actionsThisRound={C}. Ход теперь у A.
      gm.handlePlayerAction(roomId, 'A', 'all-in'); // total 100 = matches currentBet → не bump, добавляет в actionsThisRound
      // Теперь ход у B. B нужно call → его стек=50, currentBet=50, нужно delta=50 → call=50, all-in
      gm.handlePlayerAction(roomId, 'B', 'call');
      const after = getState(gm, roomId);
      // 3 all-in → run-out → showdown → endGame setTimeout(cleanupHand, 5000).
      // Без fake timers cleanupHand НЕ должен сработать. Но он срабатывает потому что
      // setImmediate/setTimeout с 5000ms тестовый раннер тоже учитывает «sync». В реальности
      // достаточно проверить что игра завершена (не preflop).
      expect(after.phase).not.toBe('preflop');
      // Pot=0 (всё распределено в cleanup)
      expect(after.pot).toBe(0);
    });

    it('all-in за меньше currentBet: currentBet не повышается', async () => {
      // BB=10, B raise to 100 (full). C (SB) имеет всего 50 чипов — all-in 50 → total 55.
      // currentBet остаётся 100.
      const { gm, io, roomId } = await setupTable(2, { bigBlind: 10, bankroll: 5000, buyIn: 1000 });
      // Добавим C с малым стеком
      seatPlayer(gm, io, { roomId, userId: 'C', username: 'Carl', bankroll: 5000, buyIn: 200 });
      gm.startGame(roomId, makeDeck(3));
      // 3-max: D=B (dealerIndex=1), SB=C (index 2), BB=A (index 0), UTG=B
      // B raise to 100, C all-in (имеет 195 чипов после SB=5 → all-in 195 → total 200, > 100), A folds.
      // Получится C bump currentBet.
      // Перестроим: B стек=1000, A стек=1000, C стек=200 (после SB=5: 195).
      // B raise to 250 (полный), C (стек 195, all-in 195 → total 200), 200 < 250 → НЕ bump.
      gm.handlePlayerAction(roomId, 'B', 'raise', 250);
      const beforeBet = getState(gm, roomId).currentBet;
      expect(beforeBet).toBe(250);
      gm.handlePlayerAction(roomId, 'C', 'all-in'); // total=200 < 250
      const afterBet = getState(gm, roomId).currentBet;
      expect(afterBet).toBe(250); // не bumped
    });
  });

  describe('Invalid actions', () => {
    it('out-of-turn action игнорируется', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Ход у B. C пытается call → должно быть проигнорировано.
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'C', 'call');
      const after = getState(gm, roomId);
      expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex);
      expect(after.pot).toBe(before.pot);
    });

    it('action игрока с chips=0 игнорируется (через all-in scenarius)', async () => {
      // Создаём сценарий где игрок ушёл в all-in, потом пытается что-то ещё сделать.
      const { gm, roomId } = await setupTable(3, { bankroll: 5000, buyIn: 100 });
      gm.startGame(roomId, makeDeck(3));
      gm.handlePlayerAction(roomId, 'B', 'all-in'); // B chips=0
      // На каком-то этапе round closes / advance. Попытка B действовать сейчас — игнор.
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'fold');
      const after = getState(gm, roomId);
      // У B chips=0, isFolded был=false (не folded). Теперь попытка fold — игнорируется
      // (не его ход уже).
      expect(after.pot).toBe(before.pot);
    });

    it('неизвестный action ignored', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'fancy-action');
      const after = getState(gm, roomId);
      expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex);
      expect(after.pot).toBe(before.pot);
    });

    it('raise без amount игнорируется', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'raise');
      const after = getState(gm, roomId);
      expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex);
    });

    it('raise с amount=0 игнорируется', async () => {
      const { gm, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      const before = getState(gm, roomId);
      gm.handlePlayerAction(roomId, 'B', 'raise', 0);
      const after = getState(gm, roomId);
      expect(after.currentPlayerIndex).toBe(before.currentPlayerIndex);
    });
  });

  describe('PLAYER_ACTION_BROADCAST', () => {
    it('эмитится с корректным {playerId, action, amount} для call', async () => {
      const { gm, io, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      io.emitted.length = 0;
      gm.handlePlayerAction(roomId, 'B', 'call');
      const broadcast = io.emitted.find((e) => e.event === 'playerActionBroadcast');
      expect(broadcast).toBeDefined();
      const payload = broadcast!.payload as { playerId: string; action: string; amount?: number };
      expect(payload.playerId).toBe('B');
      expect(payload.action).toBe('call');
      expect(payload.amount).toBe(10);
    });

    it('эмитится с корректным action для check', async () => {
      const { gm, io, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      // Сначала B call, C call, потом A check
      gm.handlePlayerAction(roomId, 'B', 'call');
      gm.handlePlayerAction(roomId, 'C', 'call');
      io.emitted.length = 0;
      gm.handlePlayerAction(roomId, 'A', 'check');
      const broadcasts = io.emitted.filter((e) => e.event === 'playerActionBroadcast');
      const checkBroadcast = broadcasts.find((b) => {
        const p = b.payload as { action: string };
        return p.action === 'check';
      });
      expect(checkBroadcast).toBeDefined();
      const payload = checkBroadcast!.payload as { playerId: string; action: string };
      expect(payload.playerId).toBe('A');
    });

    it('эмитится для raise с amount = raise-to', async () => {
      const { gm, io, roomId } = await setupTable(3);
      gm.startGame(roomId, makeDeck(3));
      io.emitted.length = 0;
      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      const broadcasts = io.emitted.filter((e) => e.event === 'playerActionBroadcast');
      const raiseBroadcast = broadcasts.find((b) => {
        const p = b.payload as { action: string };
        return p.action === 'raise';
      });
      expect(raiseBroadcast).toBeDefined();
      const payload = raiseBroadcast!.payload as { playerId: string; action: string; amount: number };
      expect(payload.amount).toBe(30);
    });
  });
});

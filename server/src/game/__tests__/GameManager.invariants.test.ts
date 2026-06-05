// Property-based тесты для GameManager через fast-check.
//
// Цель — поймать класс багов, который точечные it() тесты не видят:
// случайные последовательности действий → проверка инвариантов системы.
//
// Тесты:
// 1. sum invariant — sum(player.chips) + pot никогда не меняется на любой последовательности
//    fold/check/call. Поймает баги в pot-distribution / side-pots / placeBet.
// 2. A1 property — для рандомных bigBlind и raiseSize re-raise на (currentBet+lastRaiseSize)
//    должен быть принят. Помечен .fails — пройдёт когда A1 пофиксят.
//
// Если sum-invariant начинает падать — сначала проверить, не я ли это (последний коммит в GameManager.ts).
import { describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import fc from 'fast-check';
import {
  resetStorage,
  createTestGameManager,
  seatPlayer,
  type GameManagerLike,
} from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';

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

// ВАЖНО: pot в GameManager уже включает все currentBet'ы (placeBet делает
// chips -= amount + pot += amount). Поэтому считаем только chips + pot,
// иначе будет двойной учёт currentBet (диагностика 2026-05-30).
function totalChips(s: StateView): number {
  return s.players.reduce((sum, p) => sum + p.chips, 0) + s.pot;
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

async function setupTable(playerCount: number, bigBlind = 10) {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'Invariants',
      smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
      bigBlind,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 100,
      buyInMaxBb: 1000,
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
      bankroll: 1_000_000,
      buyIn: bigBlind * 500,
    });
  }
  return { gm, io, roomId };
}

describe('GameManager — property-based invariants', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sum invariant: chips + pot не меняется на любой последовательности fold/check/call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<'fold' | 'check' | 'call'>('fold', 'check', 'call'), {
          minLength: 1,
          maxLength: 30,
        }),
        async (actions) => {
          const { gm, roomId } = await setupTable(3);
          gm.startGame(roomId, makeDeck(3));

          const sumBefore = totalChips(getState(gm, roomId));

          for (const action of actions) {
            const s = getState(gm, roomId);
            if (s.phase === 'waiting' || s.phase === 'showdown') break;
            const player = s.players[s.currentPlayerIndex];
            if (!player) break;
            // handlePlayerAction молча отвергает невалидные действия — то что нам нужно
            gm.handlePlayerAction(roomId, player.id, action);
          }

          const sumAfter = totalChips(getState(gm, roomId));
          return sumAfter === sumBefore;
        },
      ),
      { numRuns: 100 },
    );
  });

  it.fails(
    'A1 property: re-raise на (currentBet + lastRaiseSize) должен быть принят (currently fails — A1 bug)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 4, max: 50 }), // bigBlind
          fc.integer({ min: 2, max: 5 }), // raiseMultiplier (firstRaise = BB * mult)
          async (bigBlind, mult) => {
            const firstRaiseTo = bigBlind * mult;
            const lastRaiseSize = firstRaiseTo - bigBlind;
            const specMinReRaise = firstRaiseTo + lastRaiseSize;

            const { gm, roomId } = await setupTable(3, bigBlind);
            gm.startGame(roomId, makeDeck(3));

            // B (UTG в текущей реализации) делает первый raise
            gm.handlePlayerAction(roomId, 'B', 'raise', firstRaiseTo);
            let s = getState(gm, roomId);
            if (s.currentBet !== firstRaiseTo) {
              // Open raise не принят — может быть из-за неподходящих параметров, пропускаем
              return true;
            }

            // C делает re-raise на минимально валидное (по спеке) значение
            gm.handlePlayerAction(roomId, 'C', 'raise', specMinReRaise);
            s = getState(gm, roomId);
            return s.currentBet === specMinReRaise;
          },
        ),
        { numRuns: 30 },
      );
    },
  );
});

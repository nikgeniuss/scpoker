import { describe, it, expect } from 'vitest';
import { serializeGameState } from '../gameStateSerializer.js';
import { cards } from './helpers/cards.js';

// §0.1 — карты соперников НЕ должны уходить клиенту до showdown. Изолированный тест чистого
// сериализатора (была реальная утечка через DevTools, фикс 2026-05-17).

function makeRoom(opts?: { phase?: string; tbEnabled?: boolean }) {
  const mkPlayer = (id: string, name: string, hole: string, pos: number) => ({
    id, username: name, chips: 1000, cards: cards(hole),
    isActive: true, isFolded: false, currentBet: 0, position: pos, avatar: '',
    disconnected: false, timebank: 30,
  });
  const players = new Map([
    ['A', mkPlayer('A', 'Alice', 'As Ad', 0)],
    ['B', mkPlayer('B', 'Bob', 'Ks Kd', 1)],
  ]);
  return {
    id: 'room1', name: 'T', players,
    communityCards: [], deck: cards('2c 3c 4c 5c 6c 7c 8c 9c 10c'),
    pot: 0, currentBet: 0, dealerIndex: 0, currentPlayerIndex: 0,
    phase: opts?.phase ?? 'preflop',
    turnEndsAt: null, turnDurationMs: 30000, turnTimebankEndsAt: null, turnTimebankStartedAt: null,
    smallBlind: 5, bigBlind: 10,
    timebank: { enabled: opts?.tbEnabled ?? true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60 },
  } as unknown as Parameters<typeof serializeGameState>[0];
}

const cardsOf = (s: ReturnType<typeof serializeGameState>, id: string) =>
  s.players.find((p) => p.id === id)!.cards;

describe('serializeGameState — защита карт (§0.1)', () => {
  it('без viewerId вне showdown → карт нет НИ У КОГО', () => {
    const s = serializeGameState(makeRoom());
    expect(cardsOf(s, 'A')).toEqual([]);
    expect(cardsOf(s, 'B')).toEqual([]);
  });

  it('viewerId=A → A видит свои карты, B — пустые', () => {
    const s = serializeGameState(makeRoom(), 'A');
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toEqual([]); // карты соперника НЕ уходят
  });

  it('showdown → карты раскрываются ВСЕМ', () => {
    const s = serializeGameState(makeRoom({ phase: 'showdown' }));
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toHaveLength(2);
  });

  it('withPeek → карты всех + futureBoard присутствует', () => {
    const s = serializeGameState(makeRoom(), undefined, true);
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toHaveLength(2);
    expect(Array.isArray(s.futureBoard)).toBe(true);
  });

  it('без peek → futureBoard undefined', () => {
    const s = serializeGameState(makeRoom(), 'A');
    expect(s.futureBoard).toBeUndefined();
  });

  it('timebank выключен → player.timebank undefined', () => {
    const s = serializeGameState(makeRoom({ tbEnabled: false }), 'A');
    expect(s.players[0].timebank).toBeUndefined();
    expect(s.timebankEnabled).toBe(false);
  });

  it('winners всегда null (заполняется отдельным событием GAME_WINNER)', () => {
    expect(serializeGameState(makeRoom()).winners).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { isRoundComplete } from '../phaseRules.js';

// Чистый предикат закрытия круга ставок (вынесен из GameManager, ROADMAP §9.3-B).
// Строим минимальный room-like с нужными полями.

type P = { id: string; isFolded: boolean; chips: number; currentBet: number };
function room(players: P[], currentBet: number, acted: string[]) {
  return {
    players: new Map(players.map((p) => [p.id, p])),
    currentBet,
    actionsThisRound: new Set(acted),
  } as unknown as Parameters<typeof isRoundComplete>[0];
}

describe('isRoundComplete', () => {
  it('все действовали и ставки сравнялись → круг закрыт', () => {
    const r = room(
      [{ id: 'A', isFolded: false, chips: 100, currentBet: 20 }, { id: 'B', isFolded: false, chips: 100, currentBet: 20 }],
      20, ['A', 'B'],
    );
    expect(isRoundComplete(r)).toBe(true);
  });

  it('один ещё не действовал → круг открыт (BB option)', () => {
    const r = room(
      [{ id: 'A', isFolded: false, chips: 100, currentBet: 20 }, { id: 'B', isFolded: false, chips: 100, currentBet: 20 }],
      20, ['A'],
    );
    expect(isRoundComplete(r)).toBe(false);
  });

  it('ставка не сравнялась → круг открыт', () => {
    const r = room(
      [{ id: 'A', isFolded: false, chips: 100, currentBet: 20 }, { id: 'B', isFolded: false, chips: 100, currentBet: 10 }],
      20, ['A', 'B'],
    );
    expect(isRoundComplete(r)).toBe(false);
  });

  it('all-in (chips=0) считается завершившим, даже без действия/сравнения', () => {
    const r = room(
      [{ id: 'A', isFolded: false, chips: 0, currentBet: 50 }, { id: 'B', isFolded: false, chips: 100, currentBet: 80 }],
      80, ['B'],
    );
    expect(isRoundComplete(r)).toBe(true);
  });

  it('сфолдившие игнорируются', () => {
    const r = room(
      [
        { id: 'A', isFolded: true, chips: 100, currentBet: 0 },
        { id: 'B', isFolded: false, chips: 100, currentBet: 20 },
        { id: 'C', isFolded: false, chips: 100, currentBet: 20 },
      ],
      20, ['B', 'C'],
    );
    expect(isRoundComplete(r)).toBe(true);
  });
});

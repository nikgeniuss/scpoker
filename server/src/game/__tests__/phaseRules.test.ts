import { describe, it, expect } from 'vitest';
import { isRoundComplete, computePhaseTransition } from '../phaseRules.js';

// Чистый предикат закрытия круга ставок (вынесен из GameManager, ROADMAP §9.3-B).
// Строим минимальный room-like с нужными полями.

type P = { id: string; isFolded: boolean; chips: number; currentBet: number; cards?: unknown[] };
function room(players: P[], currentBet: number, acted: string[]) {
  return {
    // По умолчанию у игрока две карты — как в реальной раздаче. Явный cards: [] означает
    // подсевшего посреди руки (ре-энтри / поздняя рег / ребаланс MTT): он в круге не участвует.
    players: new Map(players.map((p) => [p.id, { cards: [{}, {}], ...p }])),
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

  it('подсевший посреди руки (без карт) не держит круг открытым', () => {
    const r = room(
      [
        { id: 'A', isFolded: false, chips: 100, currentBet: 20 },
        { id: 'B', isFolded: false, chips: 100, currentBet: 20 },
        { id: 'C', isFolded: false, chips: 100, currentBet: 0, cards: [] },
      ],
      20, ['A', 'B'],
    );
    expect(isRoundComplete(r)).toBe(true);
  });

  it('folded players ignored', () => {
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

describe('computePhaseTransition', () => {
  const deck52 = Array.from({ length: 52 }, (_, i) => ({ rank: String(i), suit: 'spades' as const }));

  it('preflop → flop: 3 карты борда (burn + 3 = 4 из колоды)', () => {
    const t = computePhaseTransition('preflop', [...deck52]);
    expect(t.nextPhase).toBe('flop');
    expect(t.newCards).toHaveLength(3);
    expect(t.remainingDeck).toHaveLength(48); // 52 - burn(1) - flop(3)
    expect(t.isShowdown).toBe(false);
  });

  it('flop → turn: 1 карта борда (burn + 1 = 2 из колоды)', () => {
    const t = computePhaseTransition('flop', [...deck52]);
    expect(t.nextPhase).toBe('turn');
    expect(t.newCards).toHaveLength(1);
    expect(t.remainingDeck).toHaveLength(50); // 52 - burn(1) - turn(1)
    expect(t.isShowdown).toBe(false);
  });

  it('turn → river: 1 карта борда (burn + 1 = 2 из колоды)', () => {
    const t = computePhaseTransition('turn', [...deck52]);
    expect(t.nextPhase).toBe('river');
    expect(t.newCards).toHaveLength(1);
    expect(t.remainingDeck).toHaveLength(50); // 52 - burn(1) - river(1)
    expect(t.isShowdown).toBe(false);
  });

  it('river → showdown: без карт', () => {
    const t = computePhaseTransition('river', [...deck52]);
    expect(t.isShowdown).toBe(true);
    expect(t.newCards).toHaveLength(0);
    expect(t.remainingDeck).toHaveLength(52);
  });
});

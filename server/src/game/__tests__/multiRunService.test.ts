import { describe, it, expect } from 'vitest';
import { resolveMultiRunShowdown } from '../multiRunService.js';
import type { ShowdownPlayer } from '../showdownService.js';
import { card } from './helpers/cards.js';

const NO_RAKE = { percent: 0, capBb: 0 };

describe('resolveMultiRunShowdown (доделка §10.6 — Double Board/RIMT)', () => {
  it('каждый игрок выигрывает один из двух бордов → банк делится 50/50, целостность сохранена', () => {
    const A: ShowdownPlayer = { id: 'A', cards: [card('A', 's'), card('A', 'h')], totalCommitted: 100 };
    const B: ShowdownPlayer = { id: 'B', cards: [card('K', 's'), card('K', 'h')], totalCommitted: 100 };

    // Борд 1: ничего не меняет — у A пара тузов бьёт пару королей B.
    const board1 = [card('2', 'c'), card('3', 'd'), card('4', 'h'), card('5', 's'), card('7', 'c')];
    // Борд 2: каре королей у B (Kd+Kc на борде + Ks+Kh в руке).
    const board2 = [card('K', 'd'), card('K', 'c'), card('2', 'h'), card('3', 's'), card('4', 'd')];

    const result = resolveMultiRunShowdown(200, [board1, board2], 10, NO_RAKE, 'nlh', [A, B], [A, B]);

    expect(result.amounts['A']).toBe(100);
    expect(result.amounts['B']).toBe(100);
    expect(result.winners.sort()).toEqual(['A', 'B']);
    expect(result.rake).toBe(0);
    expect(result.badBeatDrop).toBe(0);
    // Целостность банка: сумма выдач = pot (рейк/дроп = 0 в этом сценарии).
    const total = Object.values(result.amounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(200);
  });

  it('один игрок выигрывает оба борда → забирает весь банк', () => {
    const A: ShowdownPlayer = { id: 'A', cards: [card('A', 's'), card('A', 'h')], totalCommitted: 100 };
    const B: ShowdownPlayer = { id: 'B', cards: [card('K', 's'), card('K', 'h')], totalCommitted: 100 };
    const board1 = [card('2', 'c'), card('3', 'd'), card('4', 'h'), card('5', 's'), card('7', 'c')];
    const board2 = [card('2', 'd'), card('3', 'c'), card('4', 's'), card('6', 'h'), card('8', 'c')];

    const result = resolveMultiRunShowdown(200, [board1, board2], 10, NO_RAKE, 'nlh', [A, B], [A, B]);

    expect(result.amounts['A']).toBe(200);
    expect(result.amounts['B']).toBeUndefined();
    expect(result.winners).toEqual(['A']);
  });
});

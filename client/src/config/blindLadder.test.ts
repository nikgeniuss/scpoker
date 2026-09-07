import { describe, it, expect } from 'vitest';
import { BLIND_LADDER, ladderIndexFor, nearestLadderIndex, sliderIndexFor, stepAt } from './blindLadder';

// Слайдер блайндов в модалке создания стола (ROADMAP §10.6). Числовые поля рядом остаются,
// поэтому значение вне лестницы — нормальная ситуация, а не ошибка.

describe('BLIND_LADDER', () => {
  it('ступени идут по возрастанию, большой блайнд всегда больше малого', () => {
    for (let i = 0; i < BLIND_LADDER.length; i++) {
      expect(BLIND_LADDER[i].bb).toBeGreaterThan(BLIND_LADDER[i].sb);
      if (i > 0) expect(BLIND_LADDER[i].bb).toBeGreaterThan(BLIND_LADDER[i - 1].bb);
    }
  });
});

describe('ladderIndexFor', () => {
  it('точное совпадение пары даёт её индекс', () => {
    expect(ladderIndexFor(5, 10)).toBe(2);
    expect(ladderIndexFor(1, 2)).toBe(0);
  });

  it('произвольная пара из полей ступенью не считается', () => {
    expect(ladderIndexFor(7, 13)).toBe(-1);
    // Тот же большой блайнд, но другой малый — тоже не ступень.
    expect(ladderIndexFor(3, 10)).toBe(-1);
  });
});

describe('nearestLadderIndex / sliderIndexFor', () => {
  it('ручка встаёт на ближайшую ступень при своём значении', () => {
    expect(sliderIndexFor(7, 13)).toBe(2); // ближе всего 5/10
  });

  it('на точной ступени ручка стоит именно на ней', () => {
    expect(sliderIndexFor(25, 50)).toBe(4);
  });

  it('значение ниже и выше лестницы прижимается к краям', () => {
    expect(nearestLadderIndex(1)).toBe(0);
    expect(nearestLadderIndex(999_999)).toBe(BLIND_LADDER.length - 1);
  });

  it('при равном расстоянии берётся меньшая ступень — не завышаем ставки молча', () => {
    // ровно между 2/5 (bb=5) и 5/10 (bb=10)
    expect(nearestLadderIndex(7.5)).toBe(1);
  });
});

describe('stepAt', () => {
  it('индекс вне диапазона зажимается, а не роняет модалку', () => {
    expect(stepAt(-3)).toEqual(BLIND_LADDER[0]);
    expect(stepAt(999)).toEqual(BLIND_LADDER[BLIND_LADDER.length - 1]);
  });

  it('дробный индекс округляется до ступени', () => {
    expect(stepAt(2.4)).toEqual(BLIND_LADDER[2]);
  });
});

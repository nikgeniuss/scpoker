import { describe, it, expect } from 'vitest';
import { applyTick, type TableTimeState } from '../tableTimeService.js';

// «Часов за столом» (ROADMAP §9.1) — начисление тиком, а не по событиям выхода.

describe('applyTick', () => {
  it('начисляет минуту каждому сидящему', () => {
    expect(applyTick({}, ['a', 'b'])).toEqual({ a: 1, b: 1 });
  });

  it('накапливает поверх уже записанного', () => {
    expect(applyTick({ a: 10 }, ['a'])).toEqual({ a: 11 });
  });

  it('не мутирует исходное состояние', () => {
    const state: TableTimeState = { a: 5 };
    applyTick(state, ['a']);
    expect(state).toEqual({ a: 5 });
  });

  it('пустой список сидящих ничего не меняет', () => {
    expect(applyTick({ a: 3 }, [])).toEqual({ a: 3 });
  });

  it('битое значение в файле не ломает счёт — начинаем с нуля', () => {
    const broken = { a: 'нет' } as unknown as TableTimeState;
    expect(applyTick(broken, ['a'])).toEqual({ a: 1 });
  });

  it('шаг начисления настраивается (интервал тика ≠ минута)', () => {
    expect(applyTick({}, ['a'], 5)).toEqual({ a: 5 });
  });
});

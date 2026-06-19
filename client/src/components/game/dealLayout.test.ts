import { describe, it, expect } from 'vitest';
import { buildDealCards } from './dealLayout';

const pos = (id: string, left: number, top: number) => ({ player: { id }, left, top });

describe('buildDealCards', () => {
  it('пустой список мест → нет летящих карт', () => {
    expect(buildDealCards([], 'a')).toEqual([]);
  });

  it('каждому месту по 2 карты в два круга (2N всего)', () => {
    const cards = buildDealCards([pos('a', 10, 20), pos('b', 30, 40), pos('c', 50, 60)], 'a');
    expect(cards).toHaveLength(6);
    // По два id на игрока: '-0' (первый круг) и '-1' (второй).
    expect(cards.filter((c) => c.id.endsWith('-0'))).toHaveLength(3);
    expect(cards.filter((c) => c.id.endsWith('-1'))).toHaveLength(3);
  });

  it('источник всех карт — позиция дилера; цель — позиция места', () => {
    const cards = buildDealCards([pos('a', 10, 20), pos('b', 30, 40)], 'b');
    // Дилер b в (30,40) — from у всех карт.
    expect(cards.every((c) => c.fromLeft === 30 && c.fromTop === 40)).toBe(true);
    const toA = cards.find((c) => c.id === 'a-0')!;
    expect([toA.toLeft, toA.toTop]).toEqual([10, 20]);
  });

  it('задержки монотонно растут (последовательная раздача)', () => {
    const cards = buildDealCards([pos('a', 0, 0), pos('b', 1, 1)], 'a');
    const delays = cards.map((c) => c.delay);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  });

  it('неизвестный dealerId → fallback на первое место', () => {
    const cards = buildDealCards([pos('a', 5, 6), pos('b', 7, 8)], 'zzz');
    expect(cards.every((c) => c.fromLeft === 5 && c.fromTop === 6)).toBe(true);
  });
});

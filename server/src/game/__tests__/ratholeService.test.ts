import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, getStorage } from './helpers/storage.js';
import {
  isWithinWindow,
  requiredBuyIn,
  pruneExpired,
  recordLeave,
  getLeaveRecord,
  clearLeaveRecord,
  clearRoom,
  type RatholeState,
} from '../ratholeService.js';

// Без рэтхола (ROADMAP §10.6): ушёл со стола с выигрышем — вернуться в окно можно только со
// стеком ухода. Правило не должно бить по проигравшему и не должно требовать больше, чем есть.

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const MIN_BUY_IN = 100;
const MAX_BUY_IN = 2_000;

describe('isWithinWindow', () => {
  it('записи нет — правило не действует', () => {
    expect(isWithinWindow(undefined, NOW, 6)).toBe(false);
  });

  it('окно выключено (0 часов) — правило не действует даже со свежей записью', () => {
    expect(isWithinWindow({ chips: 500, at: NOW }, NOW, 0)).toBe(false);
  });

  it('внутри окна — действует, на границе и позже — нет', () => {
    expect(isWithinWindow({ chips: 500, at: NOW - 5 * HOUR }, NOW, 6)).toBe(true);
    expect(isWithinWindow({ chips: 500, at: NOW - 6 * HOUR }, NOW, 6)).toBe(false);
    expect(isWithinWindow({ chips: 500, at: NOW - 7 * HOUR }, NOW, 6)).toBe(false);
  });
});

describe('requiredBuyIn', () => {
  it('без записи — обычный минимум стола', () => {
    expect(requiredBuyIn(undefined, NOW, 6, 10_000, MIN_BUY_IN, MAX_BUY_IN)).toBe(MIN_BUY_IN);
  });

  it('ушёл с крупным стеком — вернуться можно только с ним', () => {
    const rec = { chips: 900, at: NOW - HOUR };
    expect(requiredBuyIn(rec, NOW, 6, 10_000, MIN_BUY_IN, MAX_BUY_IN)).toBe(900);
  });

  it('ушёл с малым стеком (проигравший) — правило не поднимает планку выше минимума', () => {
    const rec = { chips: 50, at: NOW - HOUR };
    expect(requiredBuyIn(rec, NOW, 6, 10_000, MIN_BUY_IN, MAX_BUY_IN)).toBe(MIN_BUY_IN);
  });

  it('банкролл меньше стека ухода — требуем не больше, чем у игрока есть', () => {
    const rec = { chips: 900, at: NOW - HOUR };
    expect(requiredBuyIn(rec, NOW, 6, 400, MIN_BUY_IN, MAX_BUY_IN)).toBe(400);
  });

  it('стек ухода больше максимального бай-ина — требуем не больше максимума стола', () => {
    const rec = { chips: 5_000, at: NOW - HOUR };
    expect(requiredBuyIn(rec, NOW, 6, 10_000, MIN_BUY_IN, MAX_BUY_IN)).toBe(MAX_BUY_IN);
  });

  it('окно истекло — снова обычный минимум', () => {
    const rec = { chips: 900, at: NOW - 7 * HOUR };
    expect(requiredBuyIn(rec, NOW, 6, 10_000, MIN_BUY_IN, MAX_BUY_IN)).toBe(MIN_BUY_IN);
  });
});

describe('pruneExpired', () => {
  it('выбрасывает протухшие записи и пустые столы', () => {
    const state: RatholeState = {
      r1: { u1: { chips: 100, at: NOW - 25 * HOUR }, u2: { chips: 200, at: NOW - HOUR } },
      r2: { u3: { chips: 300, at: NOW - 30 * HOUR } },
    };
    const pruned = pruneExpired(state, NOW, 24);
    expect(pruned).toEqual({ r1: { u2: { chips: 200, at: NOW - HOUR } } });
  });

  it('не мутирует исходное состояние', () => {
    const state: RatholeState = { r1: { u1: { chips: 100, at: NOW - 25 * HOUR } } };
    pruneExpired(state, NOW, 24);
    expect(state.r1.u1).toBeDefined();
  });
});

describe('файловые обёртки', () => {
  beforeEach(() => clearStorage());

  it('запись и чтение по паре стол+игрок', () => {
    recordLeave('r1', 'u1', 750, NOW);
    expect(getLeaveRecord('r1', 'u1')).toEqual({ chips: 750, at: NOW });
    expect(getLeaveRecord('r1', 'u2')).toBeUndefined();
    expect(getLeaveRecord('r2', 'u1')).toBeUndefined(); // правило действует на своём столе
  });

  it('повторный выход перезаписывает прошлую сумму', () => {
    recordLeave('r1', 'u1', 750, NOW - HOUR);
    recordLeave('r1', 'u1', 120, NOW);
    expect(getLeaveRecord('r1', 'u1')).toEqual({ chips: 120, at: NOW });
  });

  it('посадка снимает запись, стол при этом не остаётся пустым ключом', () => {
    recordLeave('r1', 'u1', 750, NOW);
    clearLeaveRecord('r1', 'u1');
    expect(getLeaveRecord('r1', 'u1')).toBeUndefined();
    expect(getStorage('rathole.json')).toEqual({});
  });

  it('закрытие стола убирает все его записи', () => {
    recordLeave('r1', 'u1', 750, NOW);
    recordLeave('r1', 'u2', 300, NOW);
    recordLeave('r2', 'u1', 400, NOW);
    clearRoom('r1');
    expect(getStorage('rathole.json')).toEqual({ r2: { u1: { chips: 400, at: NOW } } });
  });

  it('протухшие записи вычищаются при следующей записи — файл не растёт вечно', () => {
    recordLeave('r1', 'u1', 750, NOW - 30 * HOUR);
    recordLeave('r1', 'u2', 300, NOW);
    expect(getStorage('rathole.json')).toEqual({ r1: { u2: { chips: 300, at: NOW } } });
  });

  it('снятие несуществующей записи безопасно', () => {
    expect(() => clearLeaveRecord('r1', 'u1')).not.toThrow();
    expect(() => clearRoom('r1')).not.toThrow();
  });
});

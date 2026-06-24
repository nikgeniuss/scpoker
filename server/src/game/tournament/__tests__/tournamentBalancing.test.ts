import { describe, it, expect } from 'vitest';
import { planRebalanceMove, idealTableCount, pickTableToClose } from '../tournamentBalancing.js';

describe('planRebalanceMove', () => {
  it('null при одном столе', () => {
    expect(planRebalanceMove([{ tableId: 'a', count: 9 }])).toBeNull();
  });

  it('null при разнице <2', () => {
    expect(planRebalanceMove([{ tableId: 'a', count: 5 }, { tableId: 'b', count: 4 }])).toBeNull();
  });

  it('переносит с самого полного на самый пустой при разнице >=2', () => {
    const plan = planRebalanceMove([{ tableId: 'a', count: 6 }, { tableId: 'b', count: 4 }]);
    expect(plan).toEqual({ from: 'a', to: 'b' });
  });

  it('выбирает экстремумы среди >2 столов', () => {
    const plan = planRebalanceMove([
      { tableId: 'a', count: 5 },
      { tableId: 'b', count: 9 },
      { tableId: 'c', count: 3 },
    ]);
    expect(plan).toEqual({ from: 'b', to: 'c' });
  });
});

describe('idealTableCount', () => {
  it('округляет вверх', () => {
    expect(idealTableCount(10, 9)).toBe(2);
    expect(idealTableCount(9, 9)).toBe(1);
    expect(idealTableCount(1, 9)).toBe(1);
  });
});

describe('pickTableToClose', () => {
  it('null, если столов не больше идеального', () => {
    const tables = [{ tableId: 'a', count: 5 }, { tableId: 'b', count: 4 }];
    // 9 живых, tableSize=5 → идеал ceil(9/5)=2 стола, столов ровно 2 → консолидация не нужна
    expect(pickTableToClose(tables, 9, 5)).toBeNull();
  });

  it('выбирает наименее заполненный стол при избытке столов', () => {
    const tables = [{ tableId: 'a', count: 5 }, { tableId: 'b', count: 3 }];
    // 8 живых, tableSize=9 → идеал 1 стол, столов 2 → закрыть наименее заполненный
    expect(pickTableToClose(tables, 8, 9)).toBe('b');
  });
});

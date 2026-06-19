import { describe, it, expect } from 'vitest';
import { countTablesOpened, roomNameMap, type RoomEventRecord } from '../roomEvents.js';

const events: RoomEventRecord[] = [
  { t: 1000, roomId: 'r1', name: 'Стол A', createdBy: 'x' },
  { t: 1500, roomId: 'r1', name: 'Стол A (переименован)', createdBy: 'x' }, // повтор того же стола
  { t: 2000, roomId: 'r2', name: 'Стол B', createdBy: 'y' },
  { t: 9000, roomId: 'r3', name: 'Стол C', createdBy: 'z' },
];

describe('roomEvents — лог открытия столов', () => {
  it('countTablesOpened: уникальные столы за всё время', () => {
    expect(countTablesOpened(events, null, null)).toBe(3); // r1, r2, r3
  });

  it('countTablesOpened: окно [since, until] (r3 за верхней границей)', () => {
    expect(countTablesOpened(events, null, 5000)).toBe(2); // r1, r2
    expect(countTablesOpened(events, 1800, null)).toBe(2); // r2, r3
  });

  it('roomNameMap: roomId → последнее имя', () => {
    expect(roomNameMap(events)).toEqual({
      r1: 'Стол A (переименован)',
      r2: 'Стол B',
      r3: 'Стол C',
    });
  });
});

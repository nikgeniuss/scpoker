import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage } from './helpers/storage.js';
import { recordChipOp, getChipOpsLog } from '../chipOpsLog.js';

beforeEach(() => clearStorage());

describe('chipOpsLog — лог массовых выдач/возвратов фишек (§10.9)', () => {
  it('пустой лог без записей', () => {
    expect(getChipOpsLog()).toEqual([]);
  });

  it('записывает операцию с timestamp и отдаёт новые первыми', () => {
    recordChipOp({ by: 'admin1', mode: 'add', amount: 1000, usernames: ['Alice', 'Bob'] });
    recordChipOp({ by: 'admin1', mode: 'subtract', amount: 500, usernames: ['Carol'] });
    const log = getChipOpsLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ mode: 'subtract', amount: 500, usernames: ['Carol'] });
    expect(log[1]).toMatchObject({ mode: 'add', amount: 1000, usernames: ['Alice', 'Bob'] });
    expect(typeof log[0].ts).toBe('number');
  });

  it('ограничивает выдачу лимитом limit', () => {
    for (let i = 0; i < 5; i++) {
      recordChipOp({ by: 'admin1', mode: 'add', amount: i, usernames: ['X'] });
    }
    expect(getChipOpsLog(2)).toHaveLength(2);
  });

  it('кап на 200 записей в хранилище', () => {
    for (let i = 0; i < 205; i++) {
      recordChipOp({ by: 'admin1', mode: 'add', amount: i, usernames: ['X'] });
    }
    expect(getChipOpsLog(1000)).toHaveLength(200);
  });
});

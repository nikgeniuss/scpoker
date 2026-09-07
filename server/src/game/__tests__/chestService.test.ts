import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  totalWeight,
  pickPrize,
  chestOdds,
  openChest,
  getChestsPublic,
  updateChestsSettings,
  type ChestPrize,
  type ChestDef,
} from '../chestService.js';

// Сундуки (ROADMAP §10.21.7). Розыгрыш чистый: RNG инжектируется «броском», поэтому раскладка
// призов по весам проверяется без случайности. Шансы обязаны показываться игроку открыто.

const PRIZES: ChestPrize[] = [
  { weight: 70, amount: 5 },
  { weight: 25, amount: 20 },
  { weight: 5, amount: 100 },
];

const CHEST: ChestDef = { id: 'c1', title: 'Малый сундук', prizes: PRIZES };

describe('pickPrize — раскладка по весам', () => {
  it('бросок попадает в свой сегмент по границам весов', () => {
    expect(pickPrize(PRIZES, 0)?.amount).toBe(5);
    expect(pickPrize(PRIZES, 69)?.amount).toBe(5);
    expect(pickPrize(PRIZES, 70)?.amount).toBe(20);
    expect(pickPrize(PRIZES, 94)?.amount).toBe(20);
    expect(pickPrize(PRIZES, 95)?.amount).toBe(100);
    expect(pickPrize(PRIZES, 99)?.amount).toBe(100);
  });

  it('бросок вне диапазона зажимается, а не проваливается мимо призов', () => {
    expect(pickPrize(PRIZES, -5)?.amount).toBe(5);
    expect(pickPrize(PRIZES, 10_000)?.amount).toBe(100);
  });

  it('пустой сундук приза не даёт', () => {
    expect(pickPrize([], 0)).toBeNull();
    expect(pickPrize([{ weight: 0, amount: 10 }], 0)).toBeNull();
  });

  it('каждый бросок из диапазона всегда даёт приз (без дыр в раскладке)', () => {
    const total = totalWeight(PRIZES);
    for (let roll = 0; roll < total; roll++) {
      expect(pickPrize(PRIZES, roll)).not.toBeNull();
    }
  });
});

describe('chestOdds — открытые шансы', () => {
  it('проценты считаются из весов и в сумме дают 100', () => {
    expect(chestOdds(PRIZES)).toEqual([
      { amount: 5, percent: 70 },
      { amount: 20, percent: 25 },
      { amount: 100, percent: 5 },
    ]);
  });

  it('веса не обязаны быть процентами — нормируются', () => {
    const odds = chestOdds([{ weight: 3, amount: 10 }, { weight: 1, amount: 40 }]);
    expect(odds).toEqual([{ amount: 10, percent: 75 }, { amount: 40, percent: 25 }]);
  });

  it('пустой сундук шансов не имеет', () => {
    expect(chestOdds([])).toEqual([]);
  });
});

describe('openChest — файловое состояние', () => {
  beforeEach(() => clearStorage());

  it('выключенные сундуки не открываются (вызывающий платит фиксированную награду)', () => {
    setStorage('chests.json', { enabled: false, chests: [CHEST] });
    expect(openChest('c1')).toBeNull();
  });

  it('несуществующий сундук не открывается', () => {
    setStorage('chests.json', { enabled: true, chests: [CHEST] });
    expect(openChest('нет-такого')).toBeNull();
  });

  it('включённый сундук всегда отдаёт приз из своей таблицы', () => {
    setStorage('chests.json', { enabled: true, chests: [CHEST] });
    const amounts = new Set(PRIZES.map((p) => p.amount));
    for (let i = 0; i < 50; i++) {
      const result = openChest('c1');
      expect(result).not.toBeNull();
      expect(amounts.has(result!.amount)).toBe(true);
      expect(result!.title).toBe('Малый сундук');
    }
  });
});

describe('updateChestsSettings / getChestsPublic', () => {
  beforeEach(() => clearStorage());

  it('призы с нулевым весом отбрасываются как недостижимые', () => {
    setStorage('chests.json', { enabled: false, chests: [CHEST] });
    const updated = updateChestsSettings({
      chests: [{ id: 'c1', title: 'Сундук', prizes: [{ weight: 1, amount: 5 }, { weight: 0, amount: 1000 }] }],
    });
    expect(updated.chests[0].prizes).toEqual([{ weight: 1, amount: 5 }]);
  });

  it('сундук без достижимых призов не сохраняется', () => {
    setStorage('chests.json', { enabled: true, chests: [CHEST] });
    const updated = updateChestsSettings({ chests: [{ id: 'bad', title: 'Пустой', prizes: [] }] });
    expect(updated.chests.map((c) => c.id)).toEqual(['c1']); // остался прежний каталог
  });

  it('публичная вьюшка отдаёт шансы и НЕ отдаёт веса', () => {
    setStorage('chests.json', { enabled: true, chests: [CHEST] });
    const pub = getChestsPublic();
    expect(pub.chests[0]).toEqual({
      id: 'c1',
      title: 'Малый сундук',
      odds: [{ amount: 5, percent: 70 }, { amount: 20, percent: 25 }, { amount: 100, percent: 5 }],
    });
    expect(JSON.stringify(pub)).not.toContain('weight');
  });
});

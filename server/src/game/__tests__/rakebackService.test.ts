import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  pickTier,
  pickNextTier,
  computeRakebackPayout,
  applyRakeback,
  getUserRakebackInfo,
  updateRakebackSettings,
  getRakebackPublic,
  type RakebackTier,
} from '../rakebackService.js';

const TIERS: RakebackTier[] = [
  { name: 'Bronze', minRakeCents: 0, percent: 10 },
  { name: 'Silver', minRakeCents: 1000, percent: 20 },
  { name: 'Gold', minRakeCents: 5000, percent: 30 },
];

function seed(enabled: boolean, tiers: RakebackTier[] = TIERS): void {
  setStorage('rakeback.json', { enabled, tiers, users: {}, history: [] });
}

describe('rakebackService — чистые функции', () => {
  it('pickTier выбирает наибольший порог ≤ lifetimeRake', () => {
    expect(pickTier(TIERS, 0).name).toBe('Bronze');
    expect(pickTier(TIERS, 999).name).toBe('Bronze');
    expect(pickTier(TIERS, 1000).name).toBe('Silver');
    expect(pickTier(TIERS, 4999).name).toBe('Silver');
    expect(pickTier(TIERS, 5000).name).toBe('Gold');
    expect(pickTier(TIERS, 1_000_000).name).toBe('Gold');
  });

  it('pickNextTier возвращает следующий порог или null на максимуме', () => {
    expect(pickNextTier(TIERS, 0)?.name).toBe('Silver');
    expect(pickNextTier(TIERS, 1000)?.name).toBe('Gold');
    expect(pickNextTier(TIERS, 5000)).toBeNull();
  });

  it('computeRakebackPayout — floor(rake*percent/100), 0 при percent=0 или rake≤0', () => {
    expect(computeRakebackPayout(1000, { name: 'x', minRakeCents: 0, percent: 10 })).toBe(100);
    expect(computeRakebackPayout(999, { name: 'x', minRakeCents: 0, percent: 33 })).toBe(329); // floor(329.67)
    expect(computeRakebackPayout(0, { name: 'x', minRakeCents: 0, percent: 50 })).toBe(0);
    expect(computeRakebackPayout(1000, { name: 'x', minRakeCents: 0, percent: 0 })).toBe(0);
  });
});

describe('rakebackService — applyRakeback (файловое состояние)', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('фича выключена → null, lifetime не растёт', () => {
    seed(false);
    expect(applyRakeback('u1', 'room1', 500)).toBeNull();
    expect(getUserRakebackInfo('u1').lifetimeRake).toBe(0);
  });

  it('rake≤0 → null даже при включённой фиче', () => {
    seed(true);
    expect(applyRakeback('u1', 'room1', 0)).toBeNull();
  });

  it('начисляет % текущего тира и копит lifetime/totalPaid', () => {
    seed(true);
    const r1 = applyRakeback('u1', 'room1', 500); // Bronze 10% → 50
    expect(r1).toEqual({ payout: 50, tier: TIERS[0] });
    const info = getUserRakebackInfo('u1');
    expect(info.lifetimeRake).toBe(500);
    expect(info.totalPaid).toBe(50);
    expect(info.tier.name).toBe('Bronze');
    expect(info.nextTier?.name).toBe('Silver');
  });

  it('апгрейд уровня применяется СРАЗУ на раздаче, которая пересекает порог', () => {
    seed(true);
    // lifetime 900 → +200 = 1100 ≥ Silver(1000): тир этой раздачи уже Silver (20%), не Bronze.
    applyRakeback('u1', 'room1', 900); // lifetime=900, Bronze 10% → payout 90
    const r2 = applyRakeback('u1', 'room1', 200); // lifetime=1100 → Silver 20% → payout 40
    expect(r2).toEqual({ payout: 40, tier: TIERS[1] });
    expect(getUserRakebackInfo('u1').totalPaid).toBe(90 + 40);
  });

  it('история пишется только при payout>0 и хранит верные поля', () => {
    seed(true, [{ name: 'Zero', minRakeCents: 0, percent: 0 }]);
    applyRakeback('u1', 'roomX', 1000); // percent=0 → payout=0, в историю не пишем
    expect(getUserRakebackInfo('u1').history).toHaveLength(0);

    seed(true);
    applyRakeback('u2', 'roomY', 500);
    const history = getUserRakebackInfo('u2').history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ userId: 'u2', roomId: 'roomY', rakeAmount: 500, payout: 50, tierName: 'Bronze' });
  });

  it('история per-user изолирована (чужие записи не попадают)', () => {
    seed(true);
    applyRakeback('u1', 'r1', 1000);
    applyRakeback('u2', 'r1', 1000);
    expect(getUserRakebackInfo('u1').history).toHaveLength(1);
    expect(getUserRakebackInfo('u2').history).toHaveLength(1);
  });
});

describe('rakebackService — настройки и публичная вьюшка', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('updateRakebackSettings патчит enabled/tiers, getRakebackPublic не светит users/history', () => {
    setStorage('rakeback.json', { enabled: false, tiers: TIERS, users: { secret: { lifetimeRake: 1, totalPaid: 1 } }, history: [] });
    const updated = updateRakebackSettings({ enabled: true });
    expect(updated.enabled).toBe(true);
    expect(updated.tiers).toEqual(TIERS);

    const pub = getRakebackPublic();
    expect(pub).toEqual({ enabled: true, tiers: TIERS });
    expect((pub as unknown as { users?: unknown }).users).toBeUndefined();
  });

  it('updateRakebackSettings сортирует переданные tiers по порогу', () => {
    const unsorted = [TIERS[2], TIERS[0], TIERS[1]];
    const updated = updateRakebackSettings({ tiers: unsorted });
    expect(updated.tiers.map((t) => t.name)).toEqual(['Bronze', 'Silver', 'Gold']);
  });
});

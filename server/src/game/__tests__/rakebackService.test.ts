import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  pickTier,
  pickNextTier,
  computeRakebackPayout,
  rollWeekly,
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

// Недельное окно кэшбэка — карточка «Кэшбэк недели» на /rewards (ROADMAP §10.21.8, вариант 2).
// Считается per-user счётчиком, а не по history: общий HISTORY_CAP смывается быстрее недели.
const WEEK_MS = 7 * 24 * 60 * 60_000;

describe('rakebackService — недельное окно кэшбэка', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('rollWeekly: окна ещё не было — начинается сейчас, с нуля', () => {
    expect(rollWeekly({ weeklyPaid: 0, weekStartAt: 0 }, 1000)).toEqual({ weeklyPaid: 0, weekStartAt: 1000 });
  });

  it('rollWeekly: окно ещё идёт — состояние не трогаем', () => {
    const now = 1_000_000_000;
    const u = { weeklyPaid: 50, weekStartAt: now - WEEK_MS + 1 };
    expect(rollWeekly(u, now)).toEqual(u);
  });

  it('rollWeekly: неделя истекла — счётчик обнуляется, окно начинается заново', () => {
    const now = 1_000_000_000;
    expect(rollWeekly({ weeklyPaid: 50, weekStartAt: now - WEEK_MS }, now)).toEqual({ weeklyPaid: 0, weekStartAt: now });
  });

  it('applyRakeback копит weeklyPaid отдельно от totalPaid', () => {
    seed(true);
    applyRakeback('u1', 'r1', 100); // Bronze 10% → 10
    applyRakeback('u1', 'r1', 100);
    const info = getUserRakebackInfo('u1');
    expect(info.totalPaid).toBe(20);
    expect(info.weeklyPaid).toBe(20);
  });

  it('истёкшее окно показывает 0 на чтении, не дожидаясь следующей раздачи', () => {
    setStorage('rakeback.json', {
      enabled: true,
      tiers: TIERS,
      users: { u1: { lifetimeRake: 5000, totalPaid: 500, weeklyPaid: 500, weekStartAt: Date.now() - WEEK_MS - 1 } },
      history: [],
    });
    const info = getUserRakebackInfo('u1');
    expect(info.weeklyPaid).toBe(0);
    expect(info.totalPaid).toBe(500); // lifetime-итог обнулением окна не задет
  });

  it('новая раздача после истёкшего окна начинает неделю с нуля', () => {
    setStorage('rakeback.json', {
      enabled: true,
      tiers: TIERS,
      users: { u1: { lifetimeRake: 0, totalPaid: 500, weeklyPaid: 500, weekStartAt: Date.now() - WEEK_MS - 1 } },
      history: [],
    });
    applyRakeback('u1', 'r1', 100); // Bronze 10% → 10
    expect(getUserRakebackInfo('u1').weeklyPaid).toBe(10);
  });

  it('старые записи без полей окна читаются как нулевые', () => {
    setStorage('rakeback.json', {
      enabled: true,
      tiers: TIERS,
      users: { u1: { lifetimeRake: 100, totalPaid: 10 } },
      history: [],
    });
    expect(getUserRakebackInfo('u1').weeklyPaid).toBe(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage, getStorage } from './helpers/storage.js';
import {
  weekStart,
  rollPeriod,
  addCounters,
  computeMissions,
  emptyCounters,
  addProgress,
  getUserMissions,
  claimMission,
  updateMissionsSettings,
  getMissionsCatalog,
  type MissionDef,
  type MissionsState,
} from '../missionsService.js';

// Недельные миссии (ROADMAP §10.21.3). Ключевое отличие от достижений — период: прогресс
// копится счётчиками и обнуляется на границе недели, а не считается по обрезаемому журналу раздач.

const CATALOG: MissionDef[] = [
  { id: 'm-hands', title: '50 раздач', condition: 'hands', threshold: 50, rewardAmount: 15 },
  { id: 'm-rake', title: 'Рейк', condition: 'rake', threshold: 1000, rewardAmount: 30 },
  { id: 'm-tourn', title: '3 турнира', condition: 'tournaments', threshold: 3, rewardAmount: 25 },
];

// Понедельник 2026-09-07 00:00 UTC.
const MONDAY = Date.UTC(2026, 8, 7);

function seed(enabled: boolean, patch: Partial<MissionsState> = {}): void {
  setStorage('missions.json', {
    enabled,
    catalog: CATALOG,
    periodStart: MONDAY,
    progress: {},
    claimed: {},
    ...patch,
  });
}

describe('weekStart — понедельник 00:00 UTC', () => {
  it('середина недели относится к своему понедельнику', () => {
    expect(weekStart(Date.UTC(2026, 8, 10, 15, 30))).toBe(MONDAY);
  });

  it('сам понедельник в 00:00 — уже новый период', () => {
    expect(weekStart(MONDAY)).toBe(MONDAY);
  });

  it('воскресенье принадлежит ПРЕДЫДУЩЕМУ понедельнику, а не следующему', () => {
    expect(weekStart(Date.UTC(2026, 8, 13, 23, 59))).toBe(MONDAY);
  });

  it('следующий понедельник открывает новый период', () => {
    expect(weekStart(Date.UTC(2026, 8, 14, 0, 0, 1))).toBe(MONDAY + 7 * 24 * 60 * 60 * 1000);
  });
});

describe('rollPeriod', () => {
  const state: MissionsState = {
    enabled: true,
    catalog: CATALOG,
    periodStart: MONDAY,
    progress: { u1: { hands: 40, rake: 500, tournaments: 1 } },
    claimed: { u1: ['m-hands'] },
  };

  it('та же неделя — состояние не трогаем вовсе', () => {
    expect(rollPeriod(state, MONDAY + 60_000)).toBe(state);
  });

  it('новая неделя — прогресс и забранные обнуляются, каталог и тоггл живут', () => {
    const rolled = rollPeriod(state, Date.UTC(2026, 8, 15));
    expect(rolled.progress).toEqual({});
    expect(rolled.claimed).toEqual({});
    expect(rolled.enabled).toBe(true);
    expect(rolled.catalog).toEqual(CATALOG);
    expect(rolled.periodStart).toBe(MONDAY + 7 * 24 * 60 * 60 * 1000);
  });
});

describe('computeMissions', () => {
  it('прогресс берётся по условию миссии, earned — по порогу', () => {
    const views = computeMissions(CATALOG, { hands: 50, rake: 10, tournaments: 0 }, []);
    expect(views.find((v) => v.id === 'm-hands')).toMatchObject({ progress: 50, earned: true, claimed: false });
    expect(views.find((v) => v.id === 'm-rake')).toMatchObject({ progress: 10, earned: false });
    expect(views.find((v) => v.id === 'm-tourn')).toMatchObject({ progress: 0, earned: false });
  });

  it('забранные помечены', () => {
    const views = computeMissions(CATALOG, { hands: 99, rake: 0, tournaments: 0 }, ['m-hands']);
    expect(views.find((v) => v.id === 'm-hands')?.claimed).toBe(true);
  });
});

describe('addCounters', () => {
  it('складывает только переданные поля', () => {
    expect(addCounters(emptyCounters(), { hands: 2 })).toEqual({ hands: 2, rake: 0, tournaments: 0 });
    expect(addCounters({ hands: 1, rake: 5, tournaments: 1 }, { rake: 5, tournaments: 1 })).toEqual({
      hands: 1, rake: 10, tournaments: 2,
    });
  });
});

describe('addProgress — файловые счётчики', () => {
  beforeEach(() => {
    clearStorage();
    vi.setSystemTime(new Date(MONDAY + 60_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('копит по нескольким игрокам одной записью', () => {
    seed(true);
    addProgress([
      { userId: 'u1', hands: 1, rake: 20 },
      { userId: 'u2', hands: 1, rake: 0 },
    ]);
    addProgress([{ userId: 'u1', hands: 1, rake: 30 }]);
    const s = getStorage('missions.json') as MissionsState;
    expect(s.progress.u1).toEqual({ hands: 2, rake: 50, tournaments: 0 });
    expect(s.progress.u2).toEqual({ hands: 1, rake: 0, tournaments: 0 });
  });

  it('выключенная фича ничего не копит', () => {
    seed(false);
    addProgress([{ userId: 'u1', hands: 1 }]);
    expect((getStorage('missions.json') as MissionsState).progress).toEqual({});
  });

  it('нулевые дельты не заводят игрока в файле', () => {
    seed(true);
    addProgress([{ userId: 'u1', hands: 0, rake: 0 }]);
    expect((getStorage('missions.json') as MissionsState).progress).toEqual({});
  });

  it('турниры копятся отдельным счётчиком', () => {
    seed(true);
    addProgress([{ userId: 'u1', tournaments: 1 }]);
    expect((getStorage('missions.json') as MissionsState).progress.u1.tournaments).toBe(1);
  });

  it('на новой неделе прошлый прогресс не продолжается', () => {
    seed(true, { progress: { u1: { hands: 40, rake: 0, tournaments: 0 } } });
    vi.setSystemTime(new Date(MONDAY + 8 * 24 * 60 * 60 * 1000));
    addProgress([{ userId: 'u1', hands: 1 }]);
    expect((getStorage('missions.json') as MissionsState).progress.u1.hands).toBe(1);
  });
});

describe('getUserMissions / claimMission', () => {
  beforeEach(() => {
    clearStorage();
    vi.setSystemTime(new Date(MONDAY + 60_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('выключенная фича не отдаёт список миссий', () => {
    seed(false);
    expect(getUserMissions('u1')).toMatchObject({ enabled: false, missions: [] });
  });

  it('отдаёт границы текущей недели', () => {
    seed(true);
    const { periodStart, periodEnd } = getUserMissions('u1');
    expect(periodStart).toBe(MONDAY);
    expect(periodEnd).toBe(MONDAY + 7 * 24 * 60 * 60 * 1000);
  });

  it('невыполненную миссию забрать нельзя', () => {
    seed(true, { progress: { u1: { hands: 49, rake: 0, tournaments: 0 } } });
    expect(claimMission('u1', 'm-hands')).toEqual({ error: 'not-earned' });
  });

  it('выполненная выдаёт награду один раз за неделю', () => {
    seed(true, { progress: { u1: { hands: 50, rake: 0, tournaments: 0 } } });
    expect(claimMission('u1', 'm-hands')).toEqual({ reward: 15 });
    expect(claimMission('u1', 'm-hands')).toEqual({ error: 'already-claimed' });
  });

  it('на следующей неделе ту же миссию можно выполнить и забрать снова', () => {
    seed(true, {
      progress: { u1: { hands: 50, rake: 0, tournaments: 0 } },
      claimed: { u1: ['m-hands'] },
    });
    vi.setSystemTime(new Date(MONDAY + 8 * 24 * 60 * 60 * 1000));
    // Новая неделя обнулила и прогресс: сначала снова «не выполнено».
    expect(claimMission('u1', 'm-hands')).toEqual({ error: 'not-earned' });
    addProgress([{ userId: 'u1', hands: 50 }]);
    expect(claimMission('u1', 'm-hands')).toEqual({ reward: 15 });
  });

  it('чужой клейм не влияет на другого игрока', () => {
    seed(true, { progress: { u1: { hands: 50, rake: 0, tournaments: 0 }, u2: { hands: 50, rake: 0, tournaments: 0 } } });
    claimMission('u1', 'm-hands');
    expect(claimMission('u2', 'm-hands')).toEqual({ reward: 15 });
  });

  it('несуществующая миссия и выключенная фича отбиваются', () => {
    seed(true, { progress: { u1: { hands: 50, rake: 0, tournaments: 0 } } });
    expect(claimMission('u1', 'нет-такой')).toEqual({ error: 'not-found' });
    seed(false);
    expect(claimMission('u1', 'm-hands')).toEqual({ error: 'disabled' });
  });
});

describe('updateMissionsSettings', () => {
  beforeEach(() => clearStorage());

  it('патчит тоггл и каталог, санитизирует мусор и дубли id', () => {
    seed(false);
    const updated = updateMissionsSettings({
      enabled: true,
      catalog: [
        { id: 'a', title: 'A', condition: 'rake', threshold: -5, rewardAmount: 10 },
        { id: 'a', title: 'дубль', condition: 'hands', threshold: 1, rewardAmount: 1 },
        { id: '', title: 'без id', condition: 'hands', threshold: 1, rewardAmount: 1 },
      ] as MissionDef[],
    });
    expect(updated.enabled).toBe(true);
    expect(updated.catalog).toEqual([{ id: 'a', title: 'A', condition: 'rake', threshold: 0, rewardAmount: 10 }]);
    expect(getMissionsCatalog().catalog).toHaveLength(1);
  });

  it('неизвестное условие схлопывается в hands, а не ломает файл', () => {
    seed(true);
    const updated = updateMissionsSettings({
      catalog: [{ id: 'x', title: 'X', condition: 'колдовство', threshold: 1, rewardAmount: 1 }] as unknown as MissionDef[],
    });
    expect(updated.catalog[0].condition).toBe('hands');
  });
});

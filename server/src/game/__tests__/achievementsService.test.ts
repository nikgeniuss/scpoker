import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  computeAchievements,
  claimAchievement,
  getAchievementsCatalog,
  updateAchievementsSettings,
  getClaimedIds,
  type AchievementDef,
  type AchievementProgress,
} from '../achievementsService.js';

const CATALOG: AchievementDef[] = [
  { id: 'first-hand', title: 'Первая раздача', condition: 'hands', threshold: 1, rewardAmount: 5 },
  { id: '100-hands', title: '100 рук', condition: 'hands', threshold: 100, rewardAmount: 20 },
  { id: 'tournament-win', title: 'Победа в турнире', condition: 'tournamentWins', threshold: 1, rewardAmount: 30 },
];

function seed(enabled: boolean, catalog: AchievementDef[] = CATALOG, claimed: Record<string, string[]> = {}): void {
  setStorage('achievements.json', { enabled, catalog, claimed });
}

const zeroProgress: AchievementProgress = { hands: 0, tournamentsPlayed: 0, tournamentWins: 0, lifetimeRake: 0 };

describe('achievementsService — computeAchievements (чистая функция)', () => {
  it('earned=true когда прогресс ≥ порога, claimed по set', () => {
    const progress: AchievementProgress = { ...zeroProgress, hands: 50 };
    const views = computeAchievements(CATALOG, ['first-hand'], progress);
    expect(views.find((v) => v.id === 'first-hand')).toMatchObject({ earned: true, claimed: true });
    expect(views.find((v) => v.id === '100-hands')).toMatchObject({ earned: false, claimed: false });
  });

  it('разные условия читают соответствующее поле progress', () => {
    const progress: AchievementProgress = { hands: 0, tournamentsPlayed: 0, tournamentWins: 1, lifetimeRake: 0 };
    const views = computeAchievements(CATALOG, [], progress);
    expect(views.find((v) => v.id === 'tournament-win')?.earned).toBe(true);
    expect(views.find((v) => v.id === 'first-hand')?.earned).toBe(false);
  });
});

describe('achievementsService — claimAchievement (файловое состояние)', () => {
  beforeEach(() => clearStorage());

  it('not-found для неизвестного id', () => {
    seed(true);
    expect(claimAchievement('u1', 'ghost', zeroProgress)).toEqual({ error: 'not-found' });
  });

  it('not-earned если прогресс не достиг порога', () => {
    seed(true);
    expect(claimAchievement('u1', 'first-hand', zeroProgress)).toEqual({ error: 'not-earned' });
  });

  it('успешный клейм возвращает reward и запоминает claimed', () => {
    seed(true);
    const progress: AchievementProgress = { ...zeroProgress, hands: 1 };
    expect(claimAchievement('u1', 'first-hand', progress)).toEqual({ reward: 5 });
    expect(getClaimedIds('u1')).toEqual(['first-hand']);
  });

  it('повторный клейм — already-claimed, награда не выдаётся дважды', () => {
    seed(true);
    const progress: AchievementProgress = { ...zeroProgress, hands: 1 };
    claimAchievement('u1', 'first-hand', progress);
    expect(claimAchievement('u1', 'first-hand', progress)).toEqual({ error: 'already-claimed' });
  });

  it('claimed изолирован per-user', () => {
    seed(true);
    const progress: AchievementProgress = { ...zeroProgress, hands: 1 };
    claimAchievement('u1', 'first-hand', progress);
    expect(getClaimedIds('u2')).toEqual([]);
  });
});

describe('achievementsService — настройки', () => {
  beforeEach(() => clearStorage());

  it('updateAchievementsSettings патчит enabled/catalog, не светит claimed', () => {
    setStorage('achievements.json', { enabled: false, catalog: CATALOG, claimed: { secret: ['x'] } });
    const updated = updateAchievementsSettings({ enabled: true });
    expect(updated.enabled).toBe(true);
    expect(updated.catalog).toEqual(CATALOG);

    const cfg = getAchievementsCatalog();
    expect(cfg).toEqual({ enabled: true, catalog: CATALOG });
    expect((cfg as unknown as { claimed?: unknown }).claimed).toBeUndefined();
  });

  it('дубли id в каталоге отбрасываются', () => {
    const withDupe = [...CATALOG, { ...CATALOG[0], title: 'Дубликат' }];
    const updated = updateAchievementsSettings({ catalog: withDupe });
    expect(updated.catalog).toHaveLength(CATALOG.length);
  });
});

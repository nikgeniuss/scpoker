// Общий тип награды визит-бонуса — один источник для админ-вкладки (RewardsTab) и игрок-view
// (Rewards.tsx), §0.11. Награда зациклена по дню серии (день N+1 после последнего = день 1).

export interface StreakReward {
  day: number;
  amount: number; // HUB-коины
}

// Дефолтная таблица (зеркалит server/src/game/streakService.ts DEFAULT_REWARDS).
export const STREAK_REWARD_DEFAULTS: StreakReward[] = [
  { day: 1, amount: 10 },
  { day: 2, amount: 15 },
  { day: 3, amount: 20 },
  { day: 4, amount: 30 },
  { day: 5, amount: 40 },
  { day: 6, amount: 60 },
  { day: 7, amount: 100 },
];

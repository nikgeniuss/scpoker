// Общий тип уровня рейкбэка — один источник для админ-вкладки (RakebackTab) и игрок-view (RakebackInfo), §0.11.
// Уровень определяется накопленным lifetime-рейком игрока (без сброса, как VIP-статус).

export interface RakebackTier {
  name: string;
  minRakeCents: number;
  percent: number;
}

// Дефолтная лестница уровней (зеркалит server/src/game/rakebackService.ts DEFAULT_TIERS).
export const TIER_DEFAULTS: RakebackTier[] = [
  { name: 'Bronze', minRakeCents: 0, percent: 10 },
  { name: 'Silver', minRakeCents: 2_500, percent: 20 },
  { name: 'Gold', minRakeCents: 10_000, percent: 30 },
  { name: 'Platinum', minRakeCents: 50_000, percent: 40 },
  { name: 'Diamond', minRakeCents: 200_000, percent: 50 },
];

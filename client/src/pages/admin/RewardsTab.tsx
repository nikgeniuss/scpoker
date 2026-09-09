import { StreakRewardsSection } from '../../components/admin/StreakRewardsSection';
import { AchievementsRewardsSection } from '../../components/admin/AchievementsRewardsSection';
import { MissionsRewardsSection } from '../../components/admin/MissionsRewardsSection';
import { ChestsRewardsSection } from '../../components/admin/ChestsRewardsSection';
import { RaceRewardsSection } from '../../components/admin/RaceRewardsSection';
import { ReferralRewardsSection } from '../../components/admin/ReferralRewardsSection';
import { ShopRewardsSection } from '../../components/admin/ShopRewardsSection';
import { CosmeticsRewardsSection } from '../../components/admin/CosmeticsRewardsSection';
import { DepositBonusSection } from '../../components/admin/DepositBonusSection';

// Вкладка «Награды» (ROADMAP §10.21) — единая точка настройки всех механик программы лояльности.
// Каждая механика — отдельная секция (свой toggle, свой каталог/таблица, своя кнопка сохранения,
// свои InfoButton/InfoSheet) в отдельном компоненте client/src/components/admin/*RewardsSection.tsx
// — вкладка растёт секциями по мере реализации фаз §10.21 (гонки/рефералка/магазин), не god-файлом.
export const RewardsTab = () => {
  return (
    <div className="space-y-8 pb-10 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-4">🎁 Награды</h2>
      <StreakRewardsSection />
      <AchievementsRewardsSection />
      <MissionsRewardsSection />
      <ChestsRewardsSection />
      <RaceRewardsSection />
      <ReferralRewardsSection />
      <ShopRewardsSection />
      <CosmeticsRewardsSection />
      <DepositBonusSection />
    </div>
  );
};

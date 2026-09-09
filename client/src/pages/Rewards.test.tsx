import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Rewards } from './Rewards';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import { useStreakStore } from '../store/streakStore';
import { useAchievementsStore } from '../store/achievementsStore';
import { useShopStore } from '../store/shopStore';
import { useRewardsWalletStore } from '../store/rewardsWalletStore';
import { useMissionsStore } from '../store/missionsStore';
import { useChestsStore } from '../store/chestsStore';
import { useBonusStore } from '../store/bonusStore';

// Карточка VIP-статуса на /rewards показывала лестницу уровней даже при ВЫКЛЮЧЕННОМ рейкбэке —
// то есть систему, которая ничего не начисляет (найдено 2026-08-31 на живом экране в Telegram).
// В Profile.tsx такой же бейдж скрывался корректно, здесь проверки не было.

const TIER = { name: 'Bronze', minRakeCents: 0, percent: 5 };
const NEXT_TIER = { name: 'Silver', minRakeCents: 10000, percent: 10 };

function renderRewards() {
  return render(
    <MemoryRouter initialEntries={['/rewards']}>
      <Routes>
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/rakeback" element={<div>RAKEBACK_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<Rewards /> — карточка VIP-статуса', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: null, isAdmin: false });
    // Загрузки подменяем no-op: страница дёргает их в useEffect, сеть в тестах не нужна.
    useRakebackStore.setState({
      enabled: false, tier: null, nextTier: null, lifetimeRake: 0, weeklyPaid: 0, loadMine: vi.fn(),
    });
    useStreakStore.setState({ enabled: false, loadMine: vi.fn() });
    useAchievementsStore.setState({ enabled: false, achievements: [], loadMine: vi.fn() });
    useShopStore.setState({ enabled: false, loadPublic: vi.fn() });
    useRewardsWalletStore.setState({ balance: 0, loadMine: vi.fn() });
    useMissionsStore.setState({ enabled: false, missions: [], periodEnd: 0, loadMine: vi.fn() });
    useChestsStore.setState({ enabled: false, chests: [], loadPublic: vi.fn() });
  });

  it('рейкбэк выключен — карточки VIP нет, лестница уровней не показывается', () => {
    renderRewards();
    expect(screen.queryByText('VIP статус')).toBeNull();
  });

  it('рейкбэк включён и тир загружен — карточка на месте с уровнем и прогрессом', () => {
    useRakebackStore.setState({ enabled: true, tier: TIER, nextTier: NEXT_TIER, lifetimeRake: 5000 });
    renderRewards();

    expect(screen.getByText('VIP статус')).toBeInTheDocument();
    expect(screen.getByText(/Bronze/)).toBeInTheDocument();
  });

  it('рейкбэк включён, но тир ещё не пришёл — карточку не рисуем (иначе пустая шкала)', () => {
    useRakebackStore.setState({ enabled: true, tier: null, nextTier: null });
    renderRewards();

    expect(screen.queryByText('VIP статус')).toBeNull();
  });

  it('баланс HUB-коинов показывается независимо от рейкбэка', () => {
    useRewardsWalletStore.setState({ balance: 250 });
    renderRewards();

    expect(screen.getByText('HUB')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
  });
});

// «Кэшбэк недели» — витрина реального рейкбэка за 7 дней (ROADMAP §10.21.8, вариант 2).
// Декоративной заглушки «Скоро» на этой карточке больше нет.
describe('<Rewards /> — карточка «Кэшбэк недели»', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: null, isAdmin: false });
    useRakebackStore.setState({
      enabled: false, tier: null, nextTier: null, lifetimeRake: 0, weeklyPaid: 0, loadMine: vi.fn(),
    });
    useStreakStore.setState({ enabled: false, loadMine: vi.fn() });
    useAchievementsStore.setState({ enabled: false, achievements: [], loadMine: vi.fn() });
    useShopStore.setState({ enabled: false, loadPublic: vi.fn() });
    useRewardsWalletStore.setState({ balance: 0, loadMine: vi.fn() });
    useMissionsStore.setState({ enabled: false, missions: [], periodEnd: 0, loadMine: vi.fn() });
    useChestsStore.setState({ enabled: false, chests: [], loadPublic: vi.fn() });
  });

  it('рейкбэк выключен — карточки нет (иначе ноль от системы, которая не начисляет)', () => {
    renderRewards();
    expect(screen.queryByText('Кэшбэк недели')).toBeNull();
  });

  it('рейкбэк включён — показывает сумму за неделю из rakebackStore', () => {
    useRakebackStore.setState({ enabled: true, tier: TIER, nextTier: NEXT_TIER, weeklyPaid: 120 });
    renderRewards();
    expect(screen.getByText('Кэшбэк недели')).toBeInTheDocument();
    expect(screen.getByText('120 HUB')).toBeInTheDocument();
  });

  it('клик по карточке ведёт в кабинет рейкбэка', () => {
    useRakebackStore.setState({ enabled: true, tier: TIER, nextTier: NEXT_TIER, weeklyPaid: 0 });
    renderRewards();
    fireEvent.click(screen.getByText('Кэшбэк недели'));
    expect(screen.getByText('RAKEBACK_PAGE')).toBeInTheDocument();
  });
});

// Миссии недели (§10.21.3) — повторяющиеся задания, прогресс копится на сервере и обнуляется
// в понедельник. Клеймится тапом по выполненной карточке, как достижения.
const MISSION = {
  id: 'm1', title: '50 раздач за неделю', condition: 'hands' as const,
  threshold: 50, rewardAmount: 15, progress: 20, earned: false, claimed: false,
};

describe('<Rewards /> — миссии недели', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: null, isAdmin: false });
    useRakebackStore.setState({
      enabled: false, tier: null, nextTier: null, lifetimeRake: 0, weeklyPaid: 0, loadMine: vi.fn(),
    });
    useStreakStore.setState({ enabled: false, loadMine: vi.fn() });
    useAchievementsStore.setState({ enabled: false, achievements: [], loadMine: vi.fn() });
    useShopStore.setState({ enabled: false, loadPublic: vi.fn() });
    useRewardsWalletStore.setState({ balance: 0, loadMine: vi.fn() });
    useMissionsStore.setState({ enabled: false, missions: [], periodEnd: 0, loadMine: vi.fn(), claim: vi.fn() });
    useChestsStore.setState({ enabled: false, chests: [], loadPublic: vi.fn() });
  });

  it('механика выключена — блока миссий нет', () => {
    renderRewards();
    expect(screen.queryByText('Миссии недели')).toBeNull();
  });

  it('включена — показывает миссию с прогрессом и наградой', () => {
    useMissionsStore.setState({ enabled: true, missions: [MISSION], periodEnd: Date.now() + 86_400_000 });
    renderRewards();
    expect(screen.getByText('Миссии недели')).toBeInTheDocument();
    expect(screen.getByText('50 раздач за неделю')).toBeInTheDocument();
    expect(screen.getByText('20 / 50')).toBeInTheDocument();
    expect(screen.getByText('+15 HUB')).toBeInTheDocument();
  });

  it('невыполненную миссию забрать нельзя — клик не уходит на сервер', () => {
    const claim = vi.fn();
    useMissionsStore.setState({ enabled: true, missions: [MISSION], periodEnd: Date.now() + 86_400_000, claim });
    renderRewards();
    fireEvent.click(screen.getByText('50 раздач за неделю'));
    expect(claim).not.toHaveBeenCalled();
  });

  it('выполненная и незабранная — тап клеймит', () => {
    const claim = vi.fn(async () => ({ reward: 15 }));
    useMissionsStore.setState({
      enabled: true,
      missions: [{ ...MISSION, progress: 50, earned: true }],
      periodEnd: Date.now() + 86_400_000,
      claim,
    });
    renderRewards();
    fireEvent.click(screen.getByText('50 раздач за неделю'));
    expect(claim).toHaveBeenCalledWith('tok', 'm1');
  });

  it('уже забранная показывает «Забрано» и повторно не клеймится', () => {
    const claim = vi.fn();
    useMissionsStore.setState({
      enabled: true,
      missions: [{ ...MISSION, progress: 60, earned: true, claimed: true }],
      periodEnd: Date.now() + 86_400_000,
      claim,
    });
    renderRewards();
    expect(screen.getByText('Забрано')).toBeInTheDocument();
    fireEvent.click(screen.getByText('50 раздач за неделю'));
    expect(claim).not.toHaveBeenCalled();
  });

  it('прогресс сверх порога не рисует больше 100% (60 из 50 → «50 / 50»)', () => {
    useMissionsStore.setState({
      enabled: true,
      missions: [{ ...MISSION, progress: 60, earned: true }],
      periodEnd: Date.now() + 86_400_000,
    });
    renderRewards();
    expect(screen.getByText('50 / 50')).toBeInTheDocument();
  });

  it('показывает, сколько осталось до сброса недели', () => {
    useMissionsStore.setState({
      enabled: true,
      missions: [MISSION],
      // Минута запаса: между setState и рендером Date.now() успевает уйти вперёд и срезать час.
      periodEnd: Date.now() + 2 * 86_400_000 + 5 * 3_600_000 + 60_000,
    });
    renderRewards();
    expect(screen.getByText('Обновление через 2д 5ч')).toBeInTheDocument();
  });
});

// Сундуки (§10.21.7): случайная награда вместо фиксированной. Требование — шансы видны игроку.
const CHEST = {
  id: 'chest-small',
  title: 'Малый сундук',
  odds: [{ amount: 5, percent: 70 }, { amount: 20, percent: 25 }, { amount: 100, percent: 5 }],
};

describe('<Rewards /> — сундуки', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: null, isAdmin: false });
    useRakebackStore.setState({
      enabled: false, tier: null, nextTier: null, lifetimeRake: 0, weeklyPaid: 0, loadMine: vi.fn(),
    });
    useStreakStore.setState({ enabled: false, loadMine: vi.fn() });
    useAchievementsStore.setState({ enabled: false, achievements: [], loadMine: vi.fn() });
    useShopStore.setState({ enabled: false, loadPublic: vi.fn() });
    useRewardsWalletStore.setState({ balance: 0, loadMine: vi.fn() });
    useMissionsStore.setState({ enabled: false, missions: [], periodEnd: 0, loadMine: vi.fn(), claim: vi.fn() });
    useChestsStore.setState({ enabled: false, chests: [], loadPublic: vi.fn() });
  });

  it('сундуки выключены — блока шансов нет', () => {
    renderRewards();
    expect(screen.queryByText('Сундуки и шансы')).toBeNull();
  });

  it('включены — шансы каждого приза показаны открыто', () => {
    useChestsStore.setState({ enabled: true, chests: [CHEST] });
    renderRewards();
    expect(screen.getByText('Сундуки и шансы')).toBeInTheDocument();
    expect(screen.getByText('70% · 5 HUB')).toBeInTheDocument();
    expect(screen.getByText('25% · 20 HUB')).toBeInTheDocument();
    expect(screen.getByText('5% · 100 HUB')).toBeInTheDocument();
  });

  it('миссия с сундуком показывает его название вместо суммы (сумма заранее не известна)', () => {
    useChestsStore.setState({ enabled: true, chests: [CHEST] });
    useMissionsStore.setState({
      enabled: true,
      missions: [{ ...MISSION, chestId: 'chest-small' }],
      periodEnd: Date.now() + 86_400_000,
    });
    renderRewards();
    // Название встречается дважды: в блоке шансов и на самой миссии — обе точки нужны игроку.
    expect(screen.getAllByText('🎁 Малый сундук')).toHaveLength(2);
    expect(screen.queryByText('+15 HUB')).toBeNull();
  });

  it('миссия без сундука показывает фиксированную сумму как раньше', () => {
    useMissionsStore.setState({ enabled: true, missions: [MISSION], periodEnd: Date.now() + 86_400_000 });
    renderRewards();
    expect(screen.getByText('+15 HUB')).toBeInTheDocument();
  });
});


// Депозитный бонус (§10.21.9): карточка появляется только когда бонус реально есть, а кнопка
// «Забрать» не должна быть активной, пока рейк не открыл ни одной единицы.
const BONUS = {
  id: 'b1',
  currency: 'hub' as const,
  amount: 1000,
  rakeRequired: 3000,
  rakeAccrued: 900,
  released: 300,
  claimed: 0,
  grantedAt: Date.now(),
  expiresAt: Date.now() + 30 * 86_400_000,
  source: 'first' as const,
};

describe('<Rewards /> — карточка депозитного бонуса', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: null, isAdmin: false });
    useRakebackStore.setState({
      enabled: false, tier: null, nextTier: null, lifetimeRake: 0, weeklyPaid: 0, loadMine: vi.fn(),
    });
    useStreakStore.setState({ enabled: false, loadMine: vi.fn() });
    useAchievementsStore.setState({ enabled: false, achievements: [], loadMine: vi.fn() });
    useShopStore.setState({ enabled: false, loadPublic: vi.fn() });
    useRewardsWalletStore.setState({ balance: 0, loadMine: vi.fn() });
    useMissionsStore.setState({ enabled: false, missions: [], periodEnd: 0, loadMine: vi.fn() });
    useChestsStore.setState({ enabled: false, chests: [], loadPublic: vi.fn() });
    useBonusStore.setState({
      enabled: false, currency: 'hub', available: 0, locked: 0, bonuses: [],
      loadMine: vi.fn(), claim: vi.fn(),
    });
  });

  it('фича выключена — карточки нет', () => {
    useBonusStore.setState({ enabled: false, bonuses: [BONUS], available: 300 });
    renderRewards();
    expect(screen.queryByText('Депозитный бонус')).toBeNull();
  });

  it('включена, но бонусов у игрока нет — карточку не рисуем', () => {
    useBonusStore.setState({ enabled: true, bonuses: [], available: 0 });
    renderRewards();
    expect(screen.queryByText('Депозитный бонус')).toBeNull();
  });

  it('бонус есть — показан прогресс отыгрыша и доступная сумма', () => {
    useBonusStore.setState({ enabled: true, bonuses: [BONUS], available: 300 });
    renderRewards();

    expect(screen.getByText('Депозитный бонус')).toBeInTheDocument();
    expect(screen.getByText('1000 HUB')).toBeInTheDocument();
    expect(screen.getByText('300 HUB')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('нечего забирать — кнопка неактивна', () => {
    useBonusStore.setState({
      enabled: true,
      bonuses: [{ ...BONUS, released: 0, rakeAccrued: 0 }],
      available: 0,
    });
    renderRewards();
    expect(screen.getByRole('button', { name: 'Забрать' })).toBeDisabled();
  });

  it('клик по «Забрать» уходит в claim', () => {
    const claim = vi.fn().mockResolvedValue({ chips: 0, hub: 300 });
    useBonusStore.setState({ enabled: true, bonuses: [BONUS], available: 300, claim });
    renderRewards();

    fireEvent.click(screen.getByRole('button', { name: 'Забрать' }));
    expect(claim).toHaveBeenCalledWith('tok');
  });

  it('бонус в фишках показывается деньгами, а не числом коинов', () => {
    useBonusStore.setState({
      enabled: true,
      currency: 'chips',
      bonuses: [{ ...BONUS, currency: 'chips' as const, amount: 10_000, released: 3_000 }],
      available: 3_000,
    });
    renderRewards();

    // formatMoney — центы без знака валюты: 10000 → «100», 3000 → «30» (chipFormat.ts).
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});

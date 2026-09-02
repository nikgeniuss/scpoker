import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, Gem, Trophy, Coins } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import { useStreakStore } from '../store/streakStore';
import { useAchievementsStore } from '../store/achievementsStore';
import { useShopStore } from '../store/shopStore';
import { useRewardsWalletStore } from '../store/rewardsWalletStore';

// Экран «Награды» — редизайн под референс «Modern Poker Club». VIP-блок берёт реальные
// данные из rakebackService (клик ведёт на /rakeback), «Бонус за визит» — реальные данные из
// streakService (§10.21.2), «Достижения» — реальные из achievementsService (§10.21.3, забрать
// тапом по заработанной-незабранной карточке), «Билет SNG» ведёт в реальный магазин лояльности
// (§10.21.6, /shop). «Кэшбэк недели» — декоративная заглушка, решение отложено (ROADMAP §10.21.8).

const STILL_DECORATIVE = ['weeklyCashback'] as const;

export const Rewards = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { tier, nextTier, lifetimeRake, loadMine } = useRakebackStore();
  const streak = useStreakStore();
  const achievements = useAchievementsStore();
  const shopEnabled = useShopStore((s) => s.enabled);
  const loadShopPublic = useShopStore((s) => s.loadPublic);
  const { balance, loadMine: loadWallet } = useRewardsWalletStore();

  useEffect(() => {
    loadMine(token);
    streak.loadMine(token);
    achievements.loadMine(token);
    loadShopPublic();
    loadWallet(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMine, token]);

  const handleClaim = async (id: string) => {
    const result = await achievements.claim(token, id);
    if (result && 'reward' in result) {
      toast.success(`+${result.reward} HUB`);
    } else if (result && 'error' in result) {
      toast.error(t('rewards.claimError'));
    }
  };

  const progressPct = nextTier
    ? Math.min(100, Math.round((lifetimeRake / nextTier.minRakeCents) * 100))
    : 100;

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/profile')}
            aria-label={t('rewards.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('rewards.title')}</h1>
        </div>

        {/* Баланс HUB-коинов — единый, собран из всех источников (§10.21.6) */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-amber-300/80 font-bold uppercase tracking-wider">
            <Coins size={13} /> HUB
          </span>
          <span className="text-base font-black tabular-nums text-amber-300">{balance}</span>
        </div>

        {/* VIP-статус — реальный рейкбэк-уровень, клик открывает полную страницу */}
        <button
          onClick={() => navigate('/rakeback')}
          className="w-full text-left rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2.5 mb-6 hover:bg-white/[0.07] transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Gem size={14} className="text-amber-400" />
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-400">
                {t('rewards.vipStatus')}
              </span>
            </span>
            <span className="text-xs text-white/40 truncate">
              {tier?.name ?? '—'}
              {nextTier ? ` → ${nextTier.name}` : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300"
              style={{ width: progressPct + '%' }}
            />
          </div>
          <div className="text-[10.5px] text-white/40">
            {nextTier ? t('rewards.progressToNext', { percent: progressPct }) : t('rewards.maxLevel')}
          </div>
        </button>

        {/* Достижения — реальные (achievementsService), тап по заработанной-незабранной = клейм */}
        {achievements.enabled && achievements.achievements.length > 0 && (
          <div className="mb-6">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 mb-2.5">
              {t('rewards.achievements')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {achievements.achievements.map((a) => {
                const claimable = a.earned && !a.claimed;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!claimable}
                    onClick={() => handleClaim(a.id)}
                    className={
                      'rounded-2xl border px-2 py-3.5 flex flex-col items-center gap-1.5 text-center transition-colors ' +
                      (claimable
                        ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                        : 'border-white/10 bg-white/5') +
                      (a.earned ? '' : ' opacity-40')
                    }
                  >
                    <Trophy size={18} className={a.earned ? 'text-amber-400' : 'text-white/40'} />
                    <span className="text-[9px] font-semibold text-white/70 leading-tight">{a.title}</span>
                    {claimable && (
                      <span className="text-[9px] font-bold text-emerald-400">+{a.rewardAmount} HUB</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Доступно — визит-бонус реальный (streakService), остальное декоративно */}
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 mb-2.5">
            {t('rewards.available')}
          </div>
          <div className="flex flex-col gap-2.5">
            {streak.enabled && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t('rewards.visitBonus')}</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {t('rewards.streakDay', { count: streak.streakDays })}
                  </div>
                </div>
                <span
                  className={
                    'flex-shrink-0 text-[10.5px] font-bold px-3.5 py-2 rounded-full border ' +
                    (streak.claimedToday
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-white/30 border-white/10')
                  }
                >
                  {streak.claimedToday ? `+${streak.currentReward} HUB` : t('rewards.comingSoon')}
                </span>
              </div>
            )}
            {shopEnabled && (
              <button
                onClick={() => navigate('/shop')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 flex items-center gap-3 text-left hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t('rewards.sngTicket')}</div>
                  <div className="text-xs text-white/40 mt-0.5">{t('rewards.sngTicketSub')}</div>
                </div>
                <span className="flex-shrink-0 text-[10.5px] font-bold text-emerald-400 px-3.5 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                  {t('shop.open')}
                </span>
              </button>
            )}
            {STILL_DECORATIVE.map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t(`rewards.${key}`)}</div>
                  <div className="text-xs text-white/40 mt-0.5">{t(`rewards.${key}Sub`)}</div>
                </div>
                <span className="flex-shrink-0 text-[10.5px] font-bold text-white/30 px-3.5 py-2 rounded-full border border-white/10">
                  {t('rewards.comingSoon')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

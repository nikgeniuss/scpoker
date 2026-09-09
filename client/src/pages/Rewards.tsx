import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, Gem, Trophy, Coins } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import { useStreakStore } from '../store/streakStore';
import { useAchievementsStore } from '../store/achievementsStore';
import { useMissionsStore } from '../store/missionsStore';
import { useChestsStore } from '../store/chestsStore';
import { useShopStore } from '../store/shopStore';
import { useRewardsWalletStore } from '../store/rewardsWalletStore';
import { useBonusStore } from '../store/bonusStore';
import { formatMoney } from '../config/chipFormat';

// Экран «Награды» — редизайн под референс «Modern Poker Club». VIP-блок берёт реальные
// данные из rakebackService (клик ведёт на /rakeback), «Бонус за визит» — реальные данные из
// streakService (§10.21.2), «Достижения» — реальные из achievementsService (§10.21.3, забрать
// тапом по заработанной-незабранной карточке), «Билет SNG» ведёт в реальный магазин лояльности
// (§10.21.6, /shop). «Кэшбэк недели» — витрина реального рейкбэка за последние 7 дней
// (решение пользователя по ROADMAP §10.21.8, вариант 2): новой денежной сущности нет, показываем
// per-user счётчик weeklyPaid из rakebackService. Декоративных карточек на экране больше нет.

// Название сундука по id — на карточке показываем его вместо суммы (сумма заранее не известна).
function chestTitle(chests: { id: string; title: string }[], chestId: string): string {
  return chests.find((c) => c.id === chestId)?.title ?? 'Сундук';
}

// Текст тоста при получении награды: из сундука — с его названием, иначе просто сумма.
function rewardToast(result: { reward: number; chestTitle?: string }): string {
  return result.chestTitle ? `${result.chestTitle}: +${result.reward} HUB` : `+${result.reward} HUB`;
}

// Сумма в валюте бонуса: реальные фишки — деньгами, HUB-коины — числом (§10.21.9).
function formatBonus(amount: number, currency: 'chips' | 'hub'): string {
  return currency === 'chips' ? formatMoney(amount) : amount + ' HUB';
}

// Сколько осталось до сброса миссий — «2д 5ч» / «5ч» / «<1ч». Периода ещё нет (0) — прочерк.
function formatResetIn(periodEnd: number): string {
  const left = periodEnd - Date.now();
  if (!periodEnd || left <= 0) return '—';
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  if (days > 0) return days + 'д ' + hours + 'ч';
  return hours > 0 ? hours + 'ч' : '<1ч';
}

export const Rewards = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { enabled: rakebackEnabled, tier, nextTier, lifetimeRake, weeklyPaid, loadMine } = useRakebackStore();
  const streak = useStreakStore();
  const achievements = useAchievementsStore();
  const missions = useMissionsStore();
  const chests = useChestsStore();
  const shopEnabled = useShopStore((s) => s.enabled);
  const loadShopPublic = useShopStore((s) => s.loadPublic);
  const { balance, loadMine: loadWallet } = useRewardsWalletStore();
  const bonus = useBonusStore();

  useEffect(() => {
    loadMine(token);
    streak.loadMine(token);
    achievements.loadMine(token);
    missions.loadMine(token);
    chests.loadPublic();
    loadShopPublic();
    loadWallet(token);
    bonus.loadMine(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMine, token]);

  const handleClaim = async (id: string) => {
    const result = await achievements.claim(token, id);
    if (result && 'reward' in result) {
      toast.success(rewardToast(result));
    } else if (result && 'error' in result) {
      toast.error(t('rewards.claimError'));
    }
  };

  const handleClaimMission = async (id: string) => {
    const result = await missions.claim(token, id);
    if (result && 'reward' in result) {
      toast.success(rewardToast(result));
    } else if (result && 'error' in result) {
      toast.error(t('rewards.claimError'));
    }
  };

  const handleClaimBonus = async () => {
    const result = await bonus.claim(token);
    if (!result) return;
    if ('error' in result) {
      toast.error(t('rewards.bonusClaimError'));
      return;
    }
    const parts: string[] = [];
    if (result.chips > 0) parts.push(formatMoney(result.chips));
    if (result.hub > 0) parts.push(result.hub + ' HUB');
    toast.success(t('rewards.bonusClaimed', { amount: parts.join(' + ') }));
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

        {/* VIP-статус — реальный рейкбэк-уровень, клик открывает полную страницу. Скрыт, пока
            рейкбэк выключен админом или тир ещё не загружен: иначе игроку показывалась бы
            лестница уровней, которая ничего не начисляет (то же условие, что у бейджа в
            Profile.tsx, §10.21.1). */}
        {rakebackEnabled && tier && (
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
        )}

        {/* Депозитный бонус с отыгрышем рейком (§10.21.9). Блок появляется только когда у игрока
            есть бонус: пустая карточка «бонусов нет» никому ничего не сообщает. Прогресс —
            по каждому бонусу отдельно, открывается очередью FIFO (сначала самый старый). */}
        {bonus.enabled && bonus.bonuses.length > 0 && (
          <div className="mb-6">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 mb-2.5">
              {t('rewards.depositBonus')}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
              <div className="text-[10.5px] text-white/40">{t('rewards.depositBonusSub')}</div>

              {bonus.bonuses.map((b) => {
                const pct = b.amount > 0 ? Math.min(100, Math.round((b.released / b.amount) * 100)) : 0;
                return (
                  <div key={b.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold">{formatBonus(b.amount, b.currency)}</span>
                      <span className="text-white/40 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                        style={{ width: pct + '%' }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-white/40 tabular-nums">
                      <span>
                        {t('rewards.bonusRakeProgress', {
                          done: formatMoney(b.rakeAccrued),
                          need: formatMoney(b.rakeRequired),
                        })}
                      </span>
                      <span>
                        {t('rewards.bonusExpires', { date: new Date(b.expiresAt).toLocaleDateString() })}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex flex-col">
                  <span className="text-[10.5px] uppercase tracking-wider text-white/40">
                    {t('rewards.bonusAvailable')}
                  </span>
                  <span className="text-base font-black tabular-nums text-emerald-400">
                    {formatBonus(bonus.available, bonus.currency)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={bonus.available <= 0}
                  onClick={handleClaimBonus}
                  className="min-h-[44px] px-5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-500 to-green-600 disabled:opacity-40 disabled:cursor-default"
                >
                  {t('rewards.bonusClaim')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Сундуки — шансы показываются ОТКРЫТО (ROADMAP §10.21.7): непрозрачные шансы дают
            жалобы и недоверие. Блок виден, только пока механика включена админом. */}
        {chests.enabled && chests.chests.length > 0 && (
          <div className="mb-6">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 mb-2.5">
              {t('rewards.chests')}
            </div>
            <div className="flex flex-col gap-2">
              {chests.chests.map((c) => (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-sm font-bold">🎁 {c.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-white/40 tabular-nums">
                    {c.odds.map((o, i) => (
                      <span key={i}>
                        {o.percent}% · {o.amount} HUB
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                      <span className="text-[9px] font-bold text-emerald-400">
                        {a.chestId ? '🎁' : `+${a.rewardAmount} HUB`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Миссии недели — повторяющиеся задания, прогресс копится счётчиками на сервере и
            обнуляется в понедельник 00:00 UTC (§10.21.3). Скрыты, пока механика выключена. */}
        {missions.enabled && missions.missions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">
                {t('rewards.missions')}
              </span>
              <span className="text-[10.5px] text-white/30">
                {t('rewards.missionsResetIn', { time: formatResetIn(missions.periodEnd) })}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {missions.missions.map((m) => {
                const pct = m.threshold > 0 ? Math.min(100, Math.round((m.progress / m.threshold) * 100)) : 100;
                const claimable = m.earned && !m.claimed;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!claimable}
                    onClick={() => handleClaimMission(m.id)}
                    className={
                      'w-full text-left rounded-2xl border px-4 py-3 transition-colors ' +
                      (claimable
                        ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                        : 'border-white/10 bg-white/5')
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold truncate">{m.title}</span>
                      <span
                        className={
                          'flex-shrink-0 text-[10.5px] font-bold ' +
                          (m.claimed ? 'text-white/30' : claimable ? 'text-emerald-400' : 'text-white/40')
                        }
                      >
                        {m.claimed ? t('rewards.claimed') : m.chestId ? `🎁 ${chestTitle(chests.chests, m.chestId)}` : `+${m.rewardAmount} HUB`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={'h-full ' + (m.earned ? 'bg-emerald-400' : 'bg-white/30')}
                        style={{ width: pct + '%' }}
                      />
                    </div>
                    <div className="mt-1 text-[10.5px] text-white/40 tabular-nums">
                      {Math.min(m.progress, m.threshold)} / {m.threshold}
                    </div>
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
            {/* Кэшбэк недели — сумма реального рейкбэка за текущее недельное окно. Как и VIP-блок
                выше, скрыт при выключенном рейкбэке: иначе показывали бы ноль от системы,
                которая ничего не начисляет. Клик ведёт в тот же кабинет /rakeback. */}
            {rakebackEnabled && (
              <button
                onClick={() => navigate('/rakeback')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 flex items-center gap-3 text-left hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t('rewards.weeklyCashback')}</div>
                  <div className="text-xs text-white/40 mt-0.5">{t('rewards.weeklyCashbackSub')}</div>
                </div>
                <span
                  className={
                    'flex-shrink-0 text-[10.5px] font-bold px-3.5 py-2 rounded-full border ' +
                    (weeklyPaid > 0
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-white/30 border-white/10')
                  }
                >
                  {weeklyPaid} HUB
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Gem } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import { formatMoney } from '../config/chipFormat';
import { TIER_DEFAULTS } from '../config/rakeback';

// Игрок-view «Рейкбэк» — личный кабинет VIP-кэшбэка (по аналогии с BadBeatInfo, ROADMAP «Рейкбэк»).
// Уровень определяется накопленным lifetime-рейком (без сброса). RequireAuth — нужен свой userId.

function timeAgo(t: number, lang: string, tr: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return tr('common.time.justNow');
  if (diff < 3600) return tr('common.time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return tr('common.time.hoursAgo', { count: Math.floor(diff / 3600) });
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU');
}

export const RakebackInfo = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { enabled, lifetimeRake, totalPaid, tier, nextTier, history, loadMine } = useRakebackStore();
  const tiers = useRakebackStore((s) => (s.tiers.length ? s.tiers : TIER_DEFAULTS));

  useEffect(() => {
    loadMine(token);
  }, [loadMine, token]);

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
            aria-label={t('rakebackInfo.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('rakebackInfo.title')}</h1>
        </div>

        {!enabled && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400 mb-6">
            {t('rakebackInfo.disabled')}
          </div>
        )}

        {/* Текущий уровень */}
        <div className="relative rounded-2xl overflow-hidden mb-6 p-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
              <Gem size={22} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xs text-gray-400">{t('rakebackInfo.yourLevel')}</div>
              <div className="text-2xl font-black text-amber-300">{tier?.name ?? '—'}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-gray-400">{t('rakebackInfo.cashback')}</div>
              <div className="text-2xl font-black text-emerald-400">{tier?.percent ?? 0}%</div>
            </div>
          </div>

          {nextTier && (
            <>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-1">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-400"
                  style={{ width: progressPct + '%' }}
                />
              </div>
              <div className="text-xs text-gray-400">
                {formatMoney(lifetimeRake)} / {formatMoney(nextTier.minRakeCents)} {t('rakebackInfo.toLevel')}{' '}
                <span className="text-white font-semibold">{nextTier.name}</span> ({nextTier.percent}%)
              </div>
            </>
          )}
          {!nextTier && tier && (
            <div className="text-xs text-emerald-400">{t('rakebackInfo.maxLevelReached')}</div>
          )}
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-gray-400 mb-1">{t('rakebackInfo.totalRakePaid')}</div>
            <div className="text-lg font-bold tabular-nums">{formatMoney(lifetimeRake)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-gray-400 mb-1">{t('rakebackInfo.totalCashbackReceived')}</div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">{formatMoney(totalPaid)}</div>
          </div>
        </div>

        {/* Таблица уровней */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">{t('rakebackInfo.levelsTitle')}</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden text-sm mb-6">
          <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-1 px-3 py-2 bg-gray-800 font-bold text-gray-400 text-xs">
            <span>{t('rakebackInfo.colLevel')}</span>
            <span className="text-right">{t('rakebackInfo.colThreshold')}</span>
            <span className="text-right">{t('rakebackInfo.colCashback')}</span>
          </div>
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                'grid grid-cols-[1fr_1fr_0.6fr] gap-1 px-3 py-2.5 border-t border-white/5 items-center ' +
                (tier?.name === t.name ? 'bg-emerald-500/10' : '')
              }
            >
              <span className={tier?.name === t.name ? 'text-amber-300 font-bold' : 'text-gray-300'}>{t.name}</span>
              <span className="text-right text-white tabular-nums">{formatMoney(t.minRakeCents)}</span>
              <span className="text-right text-emerald-300 tabular-nums">{t.percent}%</span>
            </div>
          ))}
        </div>

        {/* История начислений */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">{t('rakebackInfo.historyTitle')}</h2>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">{t('rakebackInfo.noHistory')}</div>
        ) : (
          <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div>
                  <div className="text-white">+{formatMoney(h.payout)}</div>
                  <div className="text-xs text-gray-500">{h.tierName} · {timeAgo(h.t, i18n.language, t)}</div>
                </div>
                <div className="text-xs text-gray-500">{t('rakebackInfo.rakeLabel')} {formatMoney(h.rakeAmount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

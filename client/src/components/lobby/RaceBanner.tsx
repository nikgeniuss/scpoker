import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import { useRaceStore } from '../../store/raceStore';

// Баннер «Гонка лидеров» в Leaderboard.tsx (ROADMAP §10.21.4) — по аналогии с BadBeatBanner.tsx,
// но без навигации: гонка сама по себе не отдельная страница, а надстройка над этим же рейтингом.
// Показывается только когда гонка включена админом. Дни до конца периода — без live-тикера
// (период измеряется днями, секундная точность не нужна, см. ROADMAP).
export const RaceBanner = () => {
  const { t } = useTranslation();
  const enabled = useRaceStore((s) => s.enabled);
  const prizeTable = useRaceStore((s) => s.prizeTable);
  const periodEndsAt = useRaceStore((s) => s.periodEndsAt);
  const metric = useRaceStore((s) => s.metric);
  const history = useRaceStore((s) => s.history);
  const loadPublic = useRaceStore((s) => s.loadPublic);
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  // Date.now() — эффект, не тело рендера (react-hooks/purity требует чистый рендер).
  useEffect(() => {
    setDaysLeft(Math.max(0, Math.ceil((periodEndsAt - Date.now()) / 86_400_000)));
  }, [periodEndsAt]);

  if (!enabled) return null;

  const lastRace = history[0];

  return (
    <div className="w-full mt-1 mb-4 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-amber-500/30 shadow-lg shadow-amber-900/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80 font-bold">
          <Flame size={13} />
          {t('leaderboard.raceTitle')}
        </span>
        <span className="text-xs text-gray-400">
          {t(metric === 'hands' ? 'leaderboard.raceMetricHands' : 'leaderboard.raceMetricPnl')} ·{' '}
          {t('leaderboard.raceDaysLeft', { count: daysLeft })}
        </span>
      </div>
      <div className="flex gap-2">
        {prizeTable.slice(0, 3).map((row) => (
          <div key={row.place} className="flex-1 rounded-xl bg-white/5 p-2 text-center">
            <div className="text-[10px] text-gray-500">{row.place}.</div>
            <div className="text-sm font-black text-amber-300 tabular-nums">+{row.amount} HUB</div>
          </div>
        ))}
      </div>
      {lastRace && lastRace.winners.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 text-[10.5px] text-gray-500">
          {t('leaderboard.raceLastWinners')}:{' '}
          <span className="text-gray-300">{lastRace.winners.map((w) => w.username).join(', ')}</span>
        </div>
      )}
    </div>
  );
};

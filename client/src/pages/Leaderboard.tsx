import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search } from 'lucide-react';
import { API_URL } from '../config/api';
import { formatMoney } from '../config/chipFormat';
import { RaceBanner } from '../components/lobby/RaceBanner';

// Публичная таблица лидеров (ROADMAP §10.5) — вход из лобби (иконка-трофей), доступна любому
// игроку. Данные из GET /api/leaderboard (только username/pnl/hands, без банкролла/роли/бана —
// это в /admin/users, admin-only). См. также admin-копию ClubLeaderboard.tsx (другой источник данных).

interface Row {
  username: string;
  pnl: number;
  hands: number;
}

type Metric = 'pnl' | 'hands';
type Period = '1d' | '7d' | 'all';

const rankColor = (i: number) =>
  i === 0 ? 'text-amber-300' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500';

export const Leaderboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const METRICS: { id: Metric; label: string }[] = [
    { id: 'pnl', label: t('leaderboard.metricPnl') },
    { id: 'hands', label: t('leaderboard.metricHands') },
  ];

  const PERIODS: { id: Period; label: string }[] = [
    { id: '1d', label: t('leaderboard.periodDay') },
    { id: '7d', label: t('leaderboard.periodWeek') },
    { id: 'all', label: t('leaderboard.periodAll') },
  ];

  const [metric, setMetric] = useState<Metric>('pnl');
  const [period, setPeriod] = useState<Period>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(API_URL + '/leaderboard?period=' + period)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Row[]) => alive && setRows(data))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [period]);

  const q = search.trim().toLowerCase();
  const sorted = (rows ?? [])
    .filter((r) => !q || r.username.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 100);

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/lobby')}
            aria-label={t('leaderboard.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('leaderboard.title')}</h1>
        </div>

        <RaceBanner />

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('leaderboard.searchPlaceholder')}
            className="w-full bg-gray-900 border border-white/10 rounded-2xl pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 placeholder:text-gray-600"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-gray-900 border border-white/10 mb-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={
                'py-2 rounded-xl text-sm font-bold transition-all ' +
                (period === p.id ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-900 border border-white/10 mb-4">
          {METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={
                'py-2.5 rounded-xl text-sm font-bold transition-all ' +
                (metric === m.id ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="text-center text-gray-600 py-16">{t('leaderboard.loading')}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-gray-600 py-16">{t('leaderboard.noData')}</div>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {sorted.map((r, i) => (
              <div
                key={r.username}
                className={'flex items-center gap-3 px-3 py-3 ' + (i > 0 ? 'border-t border-white/5' : '')}
              >
                <span className={'w-7 text-center text-base font-black tabular-nums ' + rankColor(i)}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.username}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">
                    {metric === 'pnl' ? r.hands + ' ' + t('leaderboard.handsShort') : formatMoney(r.pnl) + ' PnL'}
                  </div>
                </div>
                <span
                  className={
                    'text-sm font-bold tabular-nums ' +
                    (metric === 'pnl'
                      ? r.pnl > 0
                        ? 'text-emerald-400'
                        : r.pnl < 0
                        ? 'text-red-400'
                        : 'text-gray-300'
                      : 'text-white')
                  }
                >
                  {metric === 'pnl' ? formatMoney(r.pnl) : r.hands}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-3">
          {t('leaderboard.footnote')}
        </p>
      </div>
    </div>
  );
};

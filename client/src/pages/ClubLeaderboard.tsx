import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAdminApi } from '../hooks/useAdminApi';
import { formatMoney } from '../config/chipFormat';

// Экран «Таблица лидеров» (admin, ClubAdmin) — admin-only (lazy за RequireAdmin, §0.12).
// Живые данные: /admin/users (pnl + hands за всё время). Период день/7д — дособираем per-user
// через /admin/users/:id/stats (позапросно, без серверных правок). Боты не в users.json — только люди.

interface Row {
  id: string;
  username: string;
  role: string;
  banned: boolean;
  chips: number;
  pnl: number;
  hands: number;
}
interface Stat {
  pnl: number;
  hands: number;
}

type Metric = 'pnl' | 'hands';
const METRICS: { id: Metric; label: string }[] = [
  { id: 'pnl', label: 'По выигрышу' },
  { id: 'hands', label: 'По раздачам' },
];

type Period = '1d' | '7d' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: '1d', label: 'День' },
  { id: '7d', label: '7 дней' },
  { id: 'all', label: 'Всё время' },
];

// Цвет медали топ-3: золото / серебро / бронза.
const rankColor = (i: number) =>
  i === 0 ? 'text-amber-300' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500';

export const ClubLeaderboard = () => {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const api = useAdminApi(token);

  const [metric, setMetric] = useState<Metric>('pnl');
  const [period, setPeriod] = useState<Period>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  // Стата за период (id → {pnl,hands}); null = период «всё» (берём all-time из rows).
  const [periodStats, setPeriodStats] = useState<Record<string, Stat> | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  // Базовый список игроков (с all-time pnl/hands).
  useEffect(() => {
    let alive = true;
    api
      .get<Row[]>('/admin/users')
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [api]);

  // При смене периода (не «всё») — дособираем per-user стату за окно.
  useEffect(() => {
    if (period === 'all' || !rows) return;
    let alive = true;
    setPeriodLoading(true);
    const now = Date.now();
    const qs =
      period === '7d' ? '?period=7d' : '?period=custom&from=' + (now - 24 * 3600 * 1000) + '&to=' + now;
    Promise.all(
      rows.map((r) =>
        api
          .get<{ pnl: number; hands: number }>('/admin/users/' + r.id + '/stats' + qs)
          .then((s) => [r.id, { pnl: s.pnl, hands: s.hands }] as const)
          .catch(() => [r.id, { pnl: 0, hands: 0 }] as const),
      ),
    ).then((entries) => {
      if (!alive) return;
      setPeriodStats(Object.fromEntries(entries));
      setPeriodLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [period, rows, api]);

  const statOf = (r: Row): Stat =>
    period === 'all' ? { pnl: r.pnl, hands: r.hands } : periodStats?.[r.id] ?? { pnl: 0, hands: 0 };

  const q = search.trim().toLowerCase();
  const sorted = (rows ?? [])
    .filter((r) => !r.banned)
    .filter((r) => !q || r.username.toLowerCase().includes(q))
    .map((r) => ({ row: r, stat: statOf(r) }))
    .sort((a, b) => b.stat[metric] - a.stat[metric])
    .slice(0, 100);

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/club-admin')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">Таблица лидеров</h1>
        </div>

        {/* Поиск по нику */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по нику"
            className="w-full bg-gray-900 border border-white/10 rounded-2xl pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 placeholder:text-gray-600"
          />
        </div>

        {/* Период */}
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

        {/* Метрика */}
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

        {/* Список */}
        {rows === null || (period !== 'all' && periodLoading) ? (
          <div className="text-center text-gray-600 py-16">Загрузка…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-gray-600 py-16">Нет данных по игрокам.</div>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {sorted.map(({ row: r, stat }, i) => (
              <div
                key={r.id}
                className={
                  'flex items-center gap-3 px-3 py-3 ' + (i > 0 ? 'border-t border-white/5' : '')
                }
              >
                <span className={'w-7 text-center text-base font-black tabular-nums ' + rankColor(i)}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.username}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">
                    {metric === 'pnl' ? stat.hands + ' разд.' : formatMoney(stat.pnl) + ' PnL'}
                  </div>
                </div>
                <span
                  className={
                    'text-sm font-bold tabular-nums ' +
                    (metric === 'pnl'
                      ? stat.pnl > 0
                        ? 'text-emerald-400'
                        : stat.pnl < 0
                        ? 'text-red-400'
                        : 'text-gray-300'
                      : 'text-white')
                  }
                >
                  {metric === 'pnl' ? formatMoney(stat.pnl) : stat.hands}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-3">
          Рейтинг по игрокам-людям. «По выигрышу» — суммарный PnL, «По раздачам» — число сыгранных рук за
          выбранный период. Рейк/комиссия пока не влияют.
        </p>
      </div>
    </div>
  );
};

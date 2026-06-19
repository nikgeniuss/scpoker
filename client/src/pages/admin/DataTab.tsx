import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney } from '../../config/chipFormat';

// Админ-вкладка «Данные»: отчёты по играм за диапазон дат — игры, PnL игроков, рейк, столы,
// бэд-бит + разбивка по столам. Защита — серверная (adminMiddleware на /api/admin/stats/*).
// Деньги (pnl/rake/badBeat) приходят в центах — форматируем через formatMoney.

interface FormatStats {
  games: number;
  pnl: number;
  rake: number;
  tablesActive: number;
}

interface Overview {
  games: number;
  pnl: number;
  rake: number;
  tablesActive: number;
  tablesOpened: number;
  badBeat: number;
  badBeatPool: number;
  byFormat?: { nlh: FormatStats; shortdeck: FormatStats };
}

interface TableRow {
  roomId: string;
  name: string;
  games: number;
  pnl: number;
  rake: number;
}

type Period = 1 | 7 | 14;
const PERIODS: { id: Period; label: string }[] = [
  { id: 1, label: '1 день' },
  { id: 7, label: '7 дней' },
  { id: 14, label: '14 дней' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const DataTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);

  const [period, setPeriod] = useState<Period>(14);
  // Конец окна (день). По умолчанию — сегодня; ‹ › сдвигают окно на размер периода.
  const [endDay, setEndDay] = useState<string>(() => ymd(new Date()));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const startDay = useMemo(() => addDays(endDay, -(period - 1)), [endDay, period]);
  const today = ymd(new Date());
  const atToday = endDay >= today;

  // Часовой пояс браузера — для подписи (агрегация считается по локальным границам дня).
  const tzLabel = useMemo(() => {
    const off = -new Date().getTimezoneOffset() / 60;
    return 'UTC' + (off >= 0 ? '+' : '') + off;
  }, []);

  useEffect(() => {
    const fromMs = parseYMD(startDay).getTime();
    const end = parseYMD(endDay);
    const toMs = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
    const qs = '?from=' + fromMs + '&to=' + toMs;
    let alive = true;
    setOverview(null);
    setTables(null);
    setSelected(null);
    api
      .get<Overview>('/admin/stats/overview' + qs)
      .then((o) => alive && setOverview(o))
      .catch(() => alive && setOverview(null));
    api
      .get<TableRow[]>('/admin/stats/tables' + qs)
      .then((t) => alive && setTables(t))
      .catch(() => alive && setTables(null));
    return () => {
      alive = false;
    };
  }, [api, startDay, endDay]);

  const shift = (dir: -1 | 1) => {
    if (dir === 1 && atToday) return; // не уходим в будущее
    setEndDay((prev) => {
      const next = addDays(prev, dir * period);
      return next > today ? today : next;
    });
  };

  const hasData = !!overview && overview.games > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-1">Данные</h2>
      <p className="text-sm text-gray-500 mb-5">Отчёты по играм за выбранный период</p>

      {/* Диапазон дат + сдвиг */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => shift(-1)}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Раньше"
        >
          ‹
        </button>
        <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-800 border border-white/10">
          <span>🗓️</span>
          <span className="text-white font-semibold tabular-nums">
            {startDay} ~ {endDay}
          </span>
        </div>
        <button
          onClick={() => shift(1)}
          disabled={atToday}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label="Позже"
        >
          ›
        </button>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mb-4">
        <span>Часовой пояс</span>
        <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-semibold">{tzLabel}</span>
      </div>

      {/* Период */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-gray-800 border border-white/10 mb-5">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={
              'py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (period === p.id ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Карточки сводки */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Игры" value={overview ? String(overview.games) : '…'} />
        <StatCard
          label="Прибыль/Убыток"
          value={overview ? formatMoney(overview.pnl) : '…'}
          tone={overview ? (overview.pnl > 0 ? 'pos' : overview.pnl < 0 ? 'neg' : 'neutral') : 'neutral'}
        />
        <StatCard label="Рейк" value={overview ? formatMoney(overview.rake) : '…'} />
        <StatCard
          label="Столы"
          value={overview ? String(overview.tablesActive) : '…'}
          sub={overview ? 'открыто новых: ' + overview.tablesOpened : undefined}
        />
        <StatCard
          label="Бэд-бит"
          value={overview ? formatMoney(overview.badBeat) : '…'}
          sub={overview ? 'пул: ' + formatMoney(overview.badBeatPool) : undefined}
        />
      </div>

      {/* Разбивка по форматам — только если есть Short Deck данные */}
      {overview?.byFormat && overview.byFormat.shortdeck.games > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">По форматам</h3>
          <div className="grid grid-cols-2 gap-3">
            <FormatCard label="NLH" stats={overview.byFormat.nlh} />
            <FormatCard label="Шорт-дэк" stats={overview.byFormat.shortdeck} />
          </div>
        </div>
      )}

      {/* Разбивка по столам / пусто */}
      {!hasData ? (
        <div className="text-center text-gray-600 py-16">Нет игровых данных для отображения.</div>
      ) : (
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">По столам</h3>
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-gray-800 text-xs font-bold text-gray-400">
              <span>Стол</span>
              <span className="text-right w-14">Игры</span>
              <span className="text-right w-24">PnL</span>
              <span className="text-right w-20">Рейк</span>
            </div>
            {(tables ?? []).map((t) => (
              <button
                key={t.roomId}
                onClick={() => setSelected((cur) => (cur === t.roomId ? null : t.roomId))}
                className={
                  'w-full grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 text-left border-t border-white/5 transition-colors ' +
                  (selected === t.roomId ? 'bg-emerald-500/10' : 'hover:bg-white/5')
                }
              >
                <span className="text-white text-sm font-medium truncate" title={t.roomId}>
                  {t.name}
                </span>
                <span className="text-right w-14 text-gray-300 text-sm tabular-nums">{t.games}</span>
                <span
                  className={
                    'text-right w-24 text-sm tabular-nums font-semibold ' +
                    (t.pnl > 0 ? 'text-emerald-400' : t.pnl < 0 ? 'text-red-400' : 'text-gray-300')
                  }
                >
                  {formatMoney(t.pnl)}
                </span>
                <span className="text-right w-20 text-gray-300 text-sm tabular-nums">{formatMoney(t.rake)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            «Прибыль/Убыток» — суммарный результат игроков-людей. Рейк пока всегда 0 — комиссия в игре ещё
            не включена.
          </p>
        </div>
      )}
    </div>
  );
};

const FormatCard = ({ label, stats }: { label: string; stats: FormatStats }) => (
  <div className="rounded-2xl bg-gray-800 border border-white/10 px-4 py-4">
    <div className="text-xs font-bold text-emerald-400 mb-3 uppercase tracking-wide">{label}</div>
    <div className="grid grid-cols-2 gap-y-2 text-xs">
      <span className="text-gray-400">Игры</span>
      <span className="text-white font-semibold tabular-nums text-right">{stats.games}</span>
      <span className="text-gray-400">PnL</span>
      <span
        className={'font-semibold tabular-nums text-right ' +
          (stats.pnl > 0 ? 'text-emerald-400' : stats.pnl < 0 ? 'text-red-400' : 'text-gray-300')}
      >
        {formatMoney(stats.pnl)}
      </span>
      <span className="text-gray-400">Рейк</span>
      <span className="text-gray-300 tabular-nums text-right">{formatMoney(stats.rake)}</span>
      <span className="text-gray-400">Столы</span>
      <span className="text-gray-300 tabular-nums text-right">{stats.tablesActive}</span>
    </div>
  </div>
);

const StatCard = ({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'neutral';
}) => (
  <div className="rounded-2xl bg-gray-800 border border-white/10 px-4 py-4 flex flex-col items-center text-center">
    <span className="text-xs text-gray-400 mb-1">{label}</span>
    <span
      className={
        'text-xl font-black tabular-nums ' +
        (tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-red-400' : 'text-white')
      }
    >
      {value}
    </span>
    {sub && <span className="text-[10px] text-gray-500 mt-1">{sub}</span>}
  </div>
);

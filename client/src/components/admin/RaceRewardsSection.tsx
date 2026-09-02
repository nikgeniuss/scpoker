import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useRaceStore, type RaceMetric, type RacePrizeRow } from '../../store/raceStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Гонка лидеров» вкладки «🎁 Награды» (ROADMAP §10.21.4). По истечении periodDays сервер
// сам считает победителей за период и начисляет HUB-коины (raceService.ts, планировщик в index.ts).

const DEFAULT_PRIZE_TABLE: RacePrizeRow[] = [
  { place: 1, amount: 500 },
  { place: 2, amount: 300 },
  { place: 3, amount: 150 },
];

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Гонка лидеров',
    lines: [
      'Периодическая гонка поверх обычного рейтинга (/leaderboard) — топ игроков по выбранной метрике за период получают HUB-коины.',
      'Закрытие периода и выплаты — полностью автоматические, по расписанию на сервере. Ручного действия не требуется.',
      'Игроки с результатом ≤0 (0 рук или отрицательный PnL) не участвуют в розыгрыше приза.',
    ],
  },
  metric: {
    title: 'Метрика гонки',
    lines: [
      '«По раздачам» — считает количество сыгранных рук за период, без учёта выигрыша/проигрыша.',
      '«По выигрышу» — считает суммарный PnL за период (реальные деньги, только как измеримая величина для ранжирования — награда всё равно в HUB-коинах).',
      'Метрику «по рейку» сознательно не делаем в этой версии — см. обоснование в ROADMAP §10.21.4.',
    ],
  },
  period: {
    title: 'Длительность периода',
    lines: [
      'Через столько дней после старта период автоматически закрывается, призы начисляются, и открывается новый период.',
      'Проверка идёт раз в 15 минут — фактическое закрытие может отстать от точной границы на этот интервал.',
    ],
  },
  prizeTable: {
    title: 'Призовая таблица',
    lines: [
      'Место 1 — самый большой приз и так далее. Мест может быть больше или меньше 3.',
      'Если участников меньше, чем мест в таблице — недостающие места просто не разыгрываются в этот период.',
    ],
  },
};

export const RaceRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useRaceStore((s) => s.loadAdmin);
  const saveConfig = useRaceStore((s) => s.saveConfig);
  const loaded = useRaceStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [metric, setMetric] = useState<RaceMetric>('hands');
  const [periodDays, setPeriodDays] = useState(7);
  const [prizeTable, setPrizeTable] = useState<RacePrizeRow[]>(DEFAULT_PRIZE_TABLE);
  const [saving, setSaving] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (k: string) => () => setInfoKey(k);
  const seeded = useRef(false);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  useEffect(() => {
    if (seeded.current || !loaded) return;
    seeded.current = true;
    const s = useRaceStore.getState();
    setEnabled(s.enabled);
    setMetric(s.metric);
    setPeriodDays(s.periodDays);
    if (s.prizeTable.length) setPrizeTable(s.prizeTable);
  }, [loaded]);

  const editRow = (i: number, field: keyof RacePrizeRow, value: string) => {
    setPrizeTable((rows) =>
      rows.map((r, j) => {
        if (j !== i) return r;
        const n = Number(value);
        if (!Number.isFinite(n)) return r;
        return field === 'place' ? { ...r, place: Math.max(1, Math.round(n)) } : { ...r, amount: Math.max(0, Math.round(n)) };
      }),
    );
  };

  const addRow = () => setPrizeTable((rows) => [...rows, { place: rows.length + 1, amount: 0 }]);
  const removeRow = (i: number) => setPrizeTable((rows) => rows.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setMetric('hands');
    setPeriodDays(7);
    setPrizeTable(DEFAULT_PRIZE_TABLE);
  };

  const save = async () => {
    if (!prizeTable.length) {
      toast.error('Нужно хотя бы одно призовое место');
      return;
    }
    setSaving(true);
    await saveConfig(token, { enabled, metric, periodDays, prizeTable });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Гонка лидеров</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            Периодическая гонка с реальным призовым фондом в HUB-коинах поверх обычной таблицы лидеров.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить гонку</span>
        </label>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">Метрика</span>
              <InfoButton onClick={openInfo('metric')} />
            </div>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as RaceMetric)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400"
            >
              <option value="hands" className="bg-gray-800">По раздачам</option>
              <option value="pnl" className="bg-gray-800">По выигрышу</option>
            </select>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">Период, дней</span>
              <InfoButton onClick={openInfo('period')} />
            </div>
            <input
              type="number"
              min={1}
              value={periodDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPeriodDays(Math.max(1, Math.round(n)));
              }}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400 tabular-nums"
            />
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Призовая таблица</h3>
            <InfoButton onClick={openInfo('prizeTable')} />
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Место
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs">
            <span>Место</span>
            <span>Приз (HUB)</span>
            <span />
          </div>
          {prizeTable.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center">
              <input
                type="number"
                min={1}
                value={r.place}
                onChange={(e) => editRow(i, 'place', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <input
                type="number"
                min={0}
                value={r.amount}
                onChange={(e) => editRow(i, 'amount', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить место"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={resetDefaults} className="mt-3 text-xs text-gray-500 hover:text-white">
          Сбросить к дефолтной таблице
        </button>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить гонку'}
      </button>

      <AnimatePresence>
        {infoKey && INFO[infoKey] && (
          <InfoSheet title={INFO[infoKey].title} onClose={() => setInfoKey(null)}>
            {INFO[infoKey].lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </InfoSheet>
        )}
      </AnimatePresence>
    </div>
  );
};

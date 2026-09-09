import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronDown, RotateCcw } from 'lucide-react';
import { HandCards } from '../components/admin/badBeatCards';
import { makeTripsPair, makeQuads } from '../components/admin/badBeatHands';
import type { PlayingCard } from '../components/admin/badBeatHands';
import { TIER_DEFAULTS } from '../config/badBeat';
import type { Tier } from '../config/badBeat';
import { useBadBeatStore } from '../store/badBeatStore';
import { useAuthStore } from '../store/authStore';

// Экран «Настройки триггеров и блайндов» (админ, экран 3 эталона) — admin-only (lazy за RequireAdmin, §0.12).
// Выбор триггера per-format + модель дропа (ББ/%) — через badBeatStore на /api/admin/badbeat.
// Форматы — только NLH + Short Deck (memory game-formats).

interface Preset {
  id: string;
  cards: PlayingCard[];
  caption: string;
}
interface FormatCfg {
  key: string;
  label: string;
  color: string;
  defaultId: string;
  presets: Preset[];
}

// Пресеты квалифицирующей ПРОИГРАВШЕЙ руки. NLH — как на эталоне (bottom-sheet).
const FORMATS: FormatCfg[] = [
  {
    key: 'nlh',
    label: 'NLH',
    color: '#22c55e',
    defaultId: 'aaajj',
    presets: [
      { id: 'aaa22', cards: makeTripsPair('A', '2'), caption: 'Проиграть с AAA22 или старше.' },
      { id: 'aaa88', cards: makeTripsPair('A', '8'), caption: 'Проиграть с AAA88 или старше.' },
      { id: 'aaajj', cards: makeTripsPair('A', 'J'), caption: 'Проиграть с AAAJJ или старше.' },
      { id: 'aaakk', cards: makeTripsPair('A', 'K'), caption: 'Проиграть с AAAKK или старше.' },
      { id: '2222', cards: makeQuads('2'), caption: 'Проиграть с 2222 или старше.' },
      { id: '6666', cards: makeQuads('6'), caption: 'Проиграть с 6666 или старше.' },
    ],
  },
  {
    key: 'short',
    label: 'Short Deck',
    color: '#f97316',
    defaultId: 'aaaa',
    presets: [
      { id: '9999', cards: makeQuads('9'), caption: 'Проиграть с 9999 или старше.' },
      { id: 'tttt', cards: makeQuads('T'), caption: 'Проиграть с TTTT или старше.' },
      { id: 'jjjj', cards: makeQuads('J'), caption: 'Проиграть с JJJJ или старше.' },
      { id: 'qqqq', cards: makeQuads('Q'), caption: 'Проиграть с QQQQ или старше.' },
      { id: 'kkkk', cards: makeQuads('K'), caption: 'Проиграть с KKKK или старше.' },
      { id: 'aaaa', cards: makeQuads('A'), caption: 'Проиграть с AAAA или старше.' },
    ],
  },
];


const findPreset = (cfg: FormatCfg, id: string) => cfg.presets.find((p) => p.id === id) ?? cfg.presets[0];

// Редактируемая ячейка таблицы тиров: число + суффикс (ББ/%). Спиннеры скрыты.
const TierInput = ({
  value,
  suffix,
  color,
  onChange,
}: {
  value: number;
  suffix: string;
  color: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center justify-end gap-0.5">
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        'w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-right text-[11px] tabular-nums outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ' +
        color
      }
    />
    <span className="text-[10px] text-gray-500 w-4">{suffix}</span>
  </div>
);

export const BadBeatTriggers = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useBadBeatStore((s) => s.loadAdmin);
  const saveConfig = useBadBeatStore((s) => s.saveConfig);
  const loaded = useBadBeatStore((s) => s.loaded);

  const defaults = Object.fromEntries(FORMATS.map((f) => [f.key, f.defaultId]));
  const [selected, setSelected] = useState<Record<string, string>>(defaults);
  const [sheetFor, setSheetFor] = useState<FormatCfg | null>(null);
  const [pending, setPending] = useState<string>('');
  const [dropMode, setDropMode] = useState<'bb' | 'percent'>('bb');
  const [percent, setPercent] = useState('0.15');
  const [tiers, setTiers] = useState<Tier[]>(TIER_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  // Загрузка конфига с сервера и одноразовое сидирование локального стейта.
  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);
  useEffect(() => {
    if (seeded.current || !loaded) return;
    seeded.current = true;
    const s = useBadBeatStore.getState();
    setSelected({ ...defaults, ...s.triggers });
    setDropMode(s.dropMode);
    setPercent(String(s.percent));
    if (s.tiers.length) setTiers(s.tiers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const openSheet = (cfg: FormatCfg) => {
    setSheetFor(cfg);
    setPending(selected[cfg.key]);
  };
  const confirmSheet = () => {
    if (sheetFor) setSelected((s) => ({ ...s, [sheetFor.key]: pending }));
    setSheetFor(null);
  };
  const resetAll = () => {
    setSelected(defaults);
    setTiers(TIER_DEFAULTS);
    setPercent('0.15');
    setDropMode('bb');
  };
  const save = async () => {
    setSaving(true);
    await saveConfig(token, {
      triggers: selected,
      dropMode,
      percent: Number(percent) || 0,
      tiers,
    });
    setSaving(false);
    toast.success('Настройки сохранены');
  };
  // Правка ячейки тира (число ≥ 0). Пустую строку трактуем как 0.
  const editTier = (i: number, field: keyof Omit<Tier, 'blinds'>, value: string) => {
    const n = value === '' ? 0 : Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [field]: n } : t)));
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/club-admin/bad-beat')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-lg font-bold text-center px-10">Настройки Триггеров И Блайндов</h1>
        </div>

        {/* Интро + сброс */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className="text-sm font-medium">Установите триггер для Bad Beat Jackpot</span>
          <button
            onClick={resetAll}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full border border-white/20 text-xs text-white/80 hover:bg-white/10"
          >
            <RotateCcw size={12} /> Сбросить
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Выберите тип игры, а затем выберите «Квалифицирующиеся руки».
        </p>

        {/* Карточки форматов */}
        <div className="grid grid-cols-2 gap-3 mb-7">
          {FORMATS.map((cfg) => {
            const preset = findPreset(cfg, selected[cfg.key]);
            return (
              <button
                key={cfg.key}
                onClick={() => openSheet(cfg)}
                className="rounded-2xl bg-white/5 border border-white/10 p-3 flex flex-col items-center hover:bg-white/10 transition-colors"
              >
                <div className="w-full flex items-center justify-center relative mb-2">
                  <span className="text-sm font-bold" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                  <ChevronDown size={16} className="absolute right-0 text-gray-400" />
                </div>
                <div className="mb-2">
                  <HandCards cards={preset.cards} size="sm" />
                </div>
                <div className="text-[11px] text-gray-400 text-center">{preset.caption}</div>
              </button>
            );
          })}
        </div>

        {/* Модель дропа + таблица блайндов */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">Блайнды и отчисление</h2>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-900 border border-white/10 mb-3">
          {(['bb', 'percent'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setDropMode(m)}
              className={
                'py-2 rounded-lg text-sm font-bold transition-all ' +
                (dropMode === m ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {m === 'bb' ? 'Фикс ББ' : 'Процент'}
            </button>
          ))}
        </div>

        {dropMode === 'percent' && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-400">Процент с банка (после рейка)</span>
            <div className="ml-auto flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="0"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="w-20 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-white text-sm text-right outline-none focus:border-emerald-400"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden text-xs">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2 bg-gray-800 font-bold text-gray-400">
            <span>Блайнды</span>
            <span className="text-right">{dropMode === 'bb' ? 'Дроп' : 'Процент'}</span>
            <span className="text-right">Поб.</span>
            <span className="text-right">Прот.</span>
            <span className="text-right">Ост.</span>
          </div>
          {tiers.map((t, i) => (
            <div
              key={t.blinds}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2 border-t border-white/5 items-center"
            >
              <span className="text-gray-300 leading-tight">{t.blinds}</span>
              {/* Дроп: в ББ-режиме редактируется per-tier; в %-режиме показываем глобальный процент */}
              {dropMode === 'bb' ? (
                <TierInput value={t.bb} suffix="ББ" color="text-white" onChange={(v) => editTier(i, 'bb', v)} />
              ) : (
                <span className="text-right text-white tabular-nums">{(percent || '0') + '%'}</span>
              )}
              <TierInput value={t.win} suffix="%" color="text-emerald-300" onChange={(v) => editTier(i, 'win', v)} />
              <TierInput value={t.opp} suffix="%" color="text-amber-300" onChange={(v) => editTier(i, 'opp', v)} />
              <TierInput value={t.oth} suffix="%" color="text-gray-300" onChange={(v) => editTier(i, 'oth', v)} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-3">
          Поб. — бэд-бит победитель, Прот. — бэд-бит противник, Ост. — остальные игроки (1/n). Проценты —
          доля пула джекпота.
        </p>

        <button
          onClick={save}
          disabled={saving}
          className="w-full mt-5 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-base transition-colors"
        >
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </div>

      {/* Bottom-sheet выбора пресета */}
      <AnimatePresence>
        {sheetFor && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetFor(null)}
              className="fixed inset-0 z-40 bg-black/60"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-neutral-900 rounded-t-3xl border-t border-white/10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-black mb-4">
                ТРИГГЕР ДЖЕКПОТА —{' '}
                <span style={{ color: sheetFor.color }}>{sheetFor.label}</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 max-h-[50dvh] overflow-y-auto mb-4">
                {sheetFor.presets.map((p) => {
                  const active = pending === p.id;
                  const isDefault = p.id === sheetFor.defaultId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPending(p.id)}
                      className={
                        'rounded-2xl p-3 flex flex-col items-center border transition-colors ' +
                        (active
                          ? 'border-emerald-400 bg-emerald-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10')
                      }
                    >
                      <div className="mb-2">
                        <HandCards cards={p.cards} size="sm" />
                      </div>
                      <div className="text-[11px] text-gray-400 text-center">
                        {p.caption}
                        {isDefault && <span className="text-emerald-400"> (По умолчанию)</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={confirmSheet}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base transition-colors"
              >
                Подтвердить
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

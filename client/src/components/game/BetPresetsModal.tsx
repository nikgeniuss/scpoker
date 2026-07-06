import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, RotateCcw } from 'lucide-react';
import {
  DEFAULT_BET_PRESETS,
  OPEN_BB_STEPS,
  POSTFLOP_PCT_STEPS,
  openPresetLabel,
  postflopPresetLabel,
} from '../../config/betPresets';
import type { BetPresets, OpenPreset, PostflopPreset } from '../../config/betPresets';
import type { ChipDisplay } from '../../config/chipFormat';
import {
  CARD_COLOR_SCHEMES,
  DEFAULT_CARD_COLOR_SCHEME,
  suitColorClass,
} from '../../config/cardColors';
import type { CardColorScheme } from '../../config/cardColors';

interface Props {
  open: boolean;
  initial: BetPresets;
  initialChipDisplay: ChipDisplay;
  initialCardColors: CardColorScheme;
  onClose: () => void;
  onSave: (next: BetPresets, chipDisplay: ChipDisplay, cardColors: CardColorScheme) => void;
}

// Шаги для open: [1.5..10] + 'pot' в конце
const OPEN_OPTIONS: OpenPreset[] = [
  ...OPEN_BB_STEPS.map((v) => ({ kind: 'bb' as const, value: v })),
  { kind: 'pot' as const },
];

const POSTFLOP_OPTIONS: PostflopPreset[] = POSTFLOP_PCT_STEPS.map((v) => ({
  kind: 'percent' as const,
  value: v,
}));

function openIndex(p: OpenPreset): number {
  if (p.kind === 'pot') return OPEN_OPTIONS.length - 1;
  const i = OPEN_OPTIONS.findIndex((x) => x.kind === 'bb' && x.value === p.value);
  return i >= 0 ? i : 1; // дефолт = 2 BB
}

function postflopIndex(p: PostflopPreset): number {
  const i = POSTFLOP_OPTIONS.findIndex((x) => x.value === p.value);
  return i >= 0 ? i : 2; // дефолт = 33%
}

export const BetPresetsModal = ({
  open,
  initial,
  initialChipDisplay,
  initialCardColors,
  onClose,
  onSave,
}: Props) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<BetPresets>(initial);
  const [chipDisplayDraft, setChipDisplayDraft] = useState<ChipDisplay>(initialChipDisplay);
  const [cardColorsDraft, setCardColorsDraft] = useState<CardColorScheme>(initialCardColors);

  // Сбрасываем драфт при открытии (initial может прийти обновлённый из localStorage)
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setChipDisplayDraft(initialChipDisplay);
      setCardColorsDraft(initialCardColors);
    }
  }, [open, initial, initialChipDisplay, initialCardColors]);

  const shiftOpen = (idx: number, dir: -1 | 1) => {
    const cur = openIndex(draft.open[idx]);
    const next = Math.max(0, Math.min(OPEN_OPTIONS.length - 1, cur + dir));
    const copy = [...draft.open];
    copy[idx] = OPEN_OPTIONS[next];
    setDraft({ ...draft, open: copy });
  };

  const shiftPostflop = (idx: number, dir: -1 | 1) => {
    const cur = postflopIndex(draft.postflop[idx]);
    const next = Math.max(0, Math.min(POSTFLOP_OPTIONS.length - 1, cur + dir));
    const copy = [...draft.postflop];
    copy[idx] = POSTFLOP_OPTIONS[next];
    setDraft({ ...draft, postflop: copy });
  };

  const reset = () => {
    setDraft(DEFAULT_BET_PRESETS);
    setChipDisplayDraft('chips');
    setCardColorsDraft(DEFAULT_CARD_COLOR_SCHEME);
  };

  const apply = () => {
    onSave(draft, chipDisplayDraft, cardColorsDraft);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-white font-bold text-base">{t('betPresetsModal.title')}</h2>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              <Section title={t('betPresetsModal.openSection')} hint={t('betPresetsModal.openHint')}>
                {draft.open.map((p, i) => (
                  <PresetRow
                    key={'open-' + i}
                    label={openPresetLabel(p)}
                    onLeft={() => shiftOpen(i, -1)}
                    onRight={() => shiftOpen(i, 1)}
                    leftDisabled={openIndex(p) === 0}
                    rightDisabled={openIndex(p) === OPEN_OPTIONS.length - 1}
                  />
                ))}
              </Section>

              <Section title={t('betPresetsModal.postflopSection')} hint={t('betPresetsModal.postflopHint')}>
                {draft.postflop.map((p, i) => (
                  <PresetRow
                    key={'pf-' + i}
                    label={postflopPresetLabel(p)}
                    onLeft={() => shiftPostflop(i, -1)}
                    onRight={() => shiftPostflop(i, 1)}
                    leftDisabled={postflopIndex(p) === 0}
                    rightDisabled={postflopIndex(p) === POSTFLOP_OPTIONS.length - 1}
                  />
                ))}
              </Section>

              <label className="flex items-center justify-between gap-3 px-1 cursor-pointer select-none">
                <span className="text-white/80 text-sm">{t('betPresetsModal.noRoundLabel')}</span>
                <input
                  type="checkbox"
                  checked={!draft.roundToBigBlind}
                  onChange={(e) => setDraft({ ...draft, roundToBigBlind: !e.target.checked })}
                  className="w-5 h-5 accent-emerald-500"
                />
              </label>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide">
                    {t('betPresetsModal.chipDisplayTitle')}
                  </h3>
                  <span className="text-white/40 text-xs">{t('betPresetsModal.stackFormatHint')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['chips', 'bb'] as ChipDisplay[]).map((mode) => {
                    const active = chipDisplayDraft === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setChipDisplayDraft(mode)}
                        className={
                          'min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all ' +
                          (active
                            ? 'bg-emerald-500/30 text-white ring-2 ring-emerald-400'
                            : 'bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10')
                        }
                      >
                        {mode === 'chips' ? t('betPresetsModal.modeChips') : t('betPresetsModal.modeBb')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide">
                    {t('betPresetsModal.deckTitle')}
                  </h3>
                  <span className="text-white/40 text-xs">{t('betPresetsModal.suitColorHint')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CARD_COLOR_SCHEMES.map((s) => {
                    const active = cardColorsDraft === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setCardColorsDraft(s.id)}
                        className={
                          'flex flex-col items-center gap-1 min-h-[64px] px-2 py-2 rounded-xl text-xs font-bold transition-all ' +
                          (active
                            ? 'bg-emerald-500/30 text-white ring-2 ring-emerald-400'
                            : 'bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10')
                        }
                      >
                        <div className="flex gap-0.5 text-base bg-white/95 rounded px-1.5 py-0.5">
                          <span className={suitColorClass('spades', s.id)}>♠</span>
                          <span className={suitColorClass('hearts', s.id)}>♥</span>
                          <span className={suitColorClass('diamonds', s.id)}>♦</span>
                          <span className={suitColorClass('clubs', s.id)}>♣</span>
                        </div>
                        <span>{s.label}</span>
                        <span className="text-[10px] text-white/40 font-normal">{s.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-black/30">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-bold"
              >
                <RotateCcw size={14} /> {t('betPresetsModal.resetDefault')}
              </button>
              <button
                onClick={apply}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold shadow-lg"
              >
                {t('betPresetsModal.apply')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <h3 className="text-white text-sm font-bold uppercase tracking-wide">{title}</h3>
      {hint && <span className="text-white/40 text-xs">{hint}</span>}
    </div>
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

const PresetRow = ({
  label,
  onLeft,
  onRight,
  leftDisabled,
  rightDisabled,
}: {
  label: string;
  onLeft: () => void;
  onRight: () => void;
  leftDisabled: boolean;
  rightDisabled: boolean;
}) => (
  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5">
    <button
      onClick={onLeft}
      disabled={leftDisabled}
      aria-label={`Предыдущий: ${label}`}
      className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-20 disabled:cursor-not-allowed"
    >
      <ChevronLeft size={16} />
    </button>
    <div className="flex-1 text-center text-white font-bold text-sm">{label}</div>
    <button
      onClick={onRight}
      disabled={rightDisabled}
      aria-label={`Следующий: ${label}`}
      className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-20 disabled:cursor-not-allowed"
    >
      <ChevronRight size={16} />
    </button>
  </div>
);

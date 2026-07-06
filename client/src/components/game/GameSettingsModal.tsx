import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import {
  DEFAULT_BET_PRESETS,
  OPEN_BB_STEPS,
  POSTFLOP_PCT_STEPS,
  openPresetLabel,
  postflopPresetLabel,
} from '../../config/betPresets';
import type { BetPresets, OpenPreset, PostflopPreset } from '../../config/betPresets';
import type { ChipDisplay } from '../../config/chipFormat';
import type { CardDeck } from '../../config/cardDeck';
import type { AutoTopUpSettings, GameSettings } from '../../config/gameSettings';
import { Card } from './Card';
import type { CardData } from './Card';

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

const DECK_ORDER: CardDeck[] = ['classic', 'colored'];
// Превью колоды — 4 туза (по тузу на масть). Рендерим реальным <Card>, чтобы превью точь-в-точь
// совпадало с тем, что игрок увидит за столом.
const PREVIEW_ACES: CardData[] = [
  { rank: 'A', suit: 'spades' },
  { rank: 'A', suit: 'hearts' },
  { rank: 'A', suit: 'diamonds' },
  { rank: 'A', suit: 'clubs' },
];

interface Props {
  open: boolean;
  initialPresets: BetPresets;
  initialChipDisplay: ChipDisplay;
  initialDeck: CardDeck;
  initialSettings: GameSettings;
  onClose: () => void;
  onSave: (next: {
    presets: BetPresets;
    chipDisplay: ChipDisplay;
    deck: CardDeck;
    settings: GameSettings;
  }) => void;
}

type View = 'main' | 'presets' | 'autotopup';

export const GameSettingsModal = ({
  open,
  initialPresets,
  initialChipDisplay,
  initialDeck,
  initialSettings,
  onClose,
  onSave,
}: Props) => {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('main');
  const [presets, setPresets] = useState<BetPresets>(initialPresets);
  const [chipDisplay, setChipDisplay] = useState<ChipDisplay>(initialChipDisplay);
  const [deck, setDeck] = useState<CardDeck>(initialDeck);
  const [settings, setSettings] = useState<GameSettings>(initialSettings);

  // Сброс драфта при открытии (значения могли обновиться в localStorage)
  useEffect(() => {
    if (open) {
      setView('main');
      setPresets(initialPresets);
      setChipDisplay(initialChipDisplay);
      setDeck(initialDeck);
      setSettings(initialSettings);
    }
  }, [open, initialPresets, initialChipDisplay, initialDeck, initialSettings]);

  const shiftOpen = (idx: number, dir: -1 | 1) => {
    const cur = openIndex(presets.open[idx]);
    const next = Math.max(0, Math.min(OPEN_OPTIONS.length - 1, cur + dir));
    const copy = [...presets.open];
    copy[idx] = OPEN_OPTIONS[next];
    setPresets({ ...presets, open: copy });
  };

  const shiftPostflop = (idx: number, dir: -1 | 1) => {
    const cur = postflopIndex(presets.postflop[idx]);
    const next = Math.max(0, Math.min(POSTFLOP_OPTIONS.length - 1, cur + dir));
    const copy = [...presets.postflop];
    copy[idx] = POSTFLOP_OPTIONS[next];
    setPresets({ ...presets, postflop: copy });
  };

  const resetPresets = () => setPresets(DEFAULT_BET_PRESETS);

  const apply = () => {
    onSave({ presets, chipDisplay, deck, settings });
    onClose();
  };

  const back = () => (view === 'main' ? onClose() : setView('main'));
  const title =
    view === 'presets' ? t('gameSettingsModal.titlePresets') : view === 'autotopup' ? t('gameSettingsModal.titleAutoTopUp') : t('gameSettingsModal.titleMain');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-noswipe
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
            className="w-full max-w-md max-h-[90dvh] flex flex-col bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Шапка: стрелка «назад» + заголовок по центру */}
            <div className="relative flex items-center justify-center px-4 py-3.5 border-b border-white/10">
              <button
                onClick={back}
                aria-label={t('gameSettingsModal.back')}
                className="absolute left-3 flex items-center justify-center w-9 h-9 rounded-xl text-white/70 hover:text-white hover:bg-white/10"
              >
                <ChevronLeft size={22} />
              </button>
              <h2 className="text-white font-bold text-lg">{title}</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-1">
              {view === 'main' && (
                <div className="divide-y divide-white/10">
                  <ToggleRow
                    label={t('gameSettingsModal.soundEffects')}
                    on={settings.soundEnabled}
                    onChange={(v) => setSettings({ ...settings, soundEnabled: v })}
                  />
                  <ToggleRow
                    label={t('gameSettingsModal.vibration')}
                    on={settings.vibrationEnabled}
                    onChange={(v) => setSettings({ ...settings, vibrationEnabled: v })}
                  />
                  <ToggleRow
                    label={t('gameSettingsModal.chipDisplayBb')}
                    on={chipDisplay === 'bb'}
                    onChange={(v) => setChipDisplay(v ? 'bb' : 'chips')}
                  />
                  <ToggleRow
                    label={t('gameSettingsModal.smartFocus')}
                    on={settings.smartFocusEnabled}
                    onChange={(v) => setSettings({ ...settings, smartFocusEnabled: v })}
                  />
                  <ToggleRow
                    label={t('gameSettingsModal.handHint')}
                    on={settings.handHintEnabled}
                    onChange={(v) => setSettings({ ...settings, handHintEnabled: v })}
                  />
                  <NavRow label={t('gameSettingsModal.autoTopUpNav')} onClick={() => setView('autotopup')} />
                  <NavRow label={t('gameSettingsModal.configureBetButtons')} onClick={() => setView('presets')} />

                  <div className="py-4">
                    <div className="text-white/50 text-xs font-semibold mb-3">{t('gameSettingsModal.cardsSection')}</div>
                    <DeckCarousel deck={deck} onChange={setDeck} />
                  </div>
                </div>
              )}

              {view === 'presets' && (
                <div className="py-3 space-y-5">
                  <Section title={t('betPresetsModal.openSection')} hint={t('betPresetsModal.openHint')}>
                    {presets.open.map((p, i) => (
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
                    {presets.postflop.map((p, i) => (
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
                      checked={!presets.roundToBigBlind}
                      onChange={(e) => setPresets({ ...presets, roundToBigBlind: !e.target.checked })}
                      className="w-5 h-5 accent-emerald-500"
                    />
                  </label>

                  <button
                    onClick={resetPresets}
                    className="flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-bold"
                  >
                    <RotateCcw size={14} /> {t('betPresetsModal.resetDefault')}
                  </button>
                </div>
              )}

              {view === 'autotopup' && (
                <AutoTopUpView
                  value={settings.autoTopUp}
                  onChange={(autoTopUp) => setSettings({ ...settings, autoTopUp })}
                />
              )}
            </div>

            <div className="px-4 py-3 border-t border-white/10 bg-black/30">
              <button
                onClick={apply}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-base shadow-lg"
              >
                {t('gameSettingsModal.confirm')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Строки-тумблеры и переходы ───

const SwitchVisual = ({ on }: { on: boolean }) => (
  <span
    className={
      'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ' +
      (on ? 'bg-emerald-500' : 'bg-white/15')
    }
  >
    <span
      className={
        'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ' +
        (on ? 'translate-x-6' : 'translate-x-1')
      }
    />
  </span>
);

const ToggleRow = ({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className="w-full min-h-[52px] flex items-center justify-between gap-3 text-left"
  >
    <span className="text-white text-[15px] font-medium">{label}</span>
    <SwitchVisual on={on} />
  </button>
);

const NavRow = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[52px] flex items-center justify-between gap-3 text-left group"
  >
    <span className="text-white text-[15px] font-medium">{label}</span>
    <ChevronRight size={20} className="text-white/40 group-hover:text-white/70" />
  </button>
);

// ─── Карусель колоды ───

const CircleBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/10"
  >
    {children}
  </button>
);

const DeckCarousel = ({ deck, onChange }: { deck: CardDeck; onChange: (d: CardDeck) => void }) => {
  const { t } = useTranslation();
  const idx = DECK_ORDER.indexOf(deck);
  const DECK_LABELS: Record<CardDeck, { label: string; hint: string }> = {
    classic: { label: t('gameSettingsModal.deckClassicLabel'), hint: t('gameSettingsModal.deckClassicHint') },
    colored: { label: t('gameSettingsModal.deckColoredLabel'), hint: t('gameSettingsModal.deckColoredHint') },
  };
  const cur = DECK_LABELS[deck] ?? DECK_LABELS.classic;
  const go = (dir: -1 | 1) => onChange(DECK_ORDER[(idx + dir + DECK_ORDER.length) % DECK_ORDER.length]);
  return (
    <div className="flex items-center justify-center gap-3">
      <CircleBtn onClick={() => go(-1)}>
        <ChevronLeft size={18} />
      </CircleBtn>
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-4">
        <div className="flex gap-1.5">
          {PREVIEW_ACES.map((c) => (
            <Card key={c.suit} card={c} faceStyle="classic" backStyle="classic-blue" deck={deck} size="sm" />
          ))}
        </div>
        <span className="text-white/70 text-xs font-semibold">
          {cur.label} · {cur.hint}
        </span>
      </div>
      <CircleBtn onClick={() => go(1)}>
        <ChevronRight size={18} />
      </CircleBtn>
    </div>
  );
};

// ─── Подэкран авто-дополнения ───

const AutoTopUpView = ({
  value,
  onChange,
}: {
  value: AutoTopUpSettings;
  onChange: (v: AutoTopUpSettings) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="py-3 space-y-4">
      <div className="divide-y divide-white/10">
        <ToggleRow
          label={t('gameSettingsModal.enableAutoTopUp')}
          on={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>
      <Stepper
        label={t('gameSettingsModal.topUpBelow')}
        suffix={t('common.bbAbbrev')}
        value={value.thresholdBB}
        min={5}
        max={500}
        step={5}
        disabled={!value.enabled}
        onChange={(thresholdBB) => onChange({ ...value, thresholdBB })}
      />
      <Stepper
        label={t('gameSettingsModal.topUpTo')}
        suffix={t('common.bbAbbrev')}
        value={value.targetBB}
        min={20}
        max={500}
        step={5}
        disabled={!value.enabled}
        onChange={(targetBB) => onChange({ ...value, targetBB })}
      />
      <p className="text-white/40 text-xs leading-relaxed px-1">
        {t('gameSettingsModal.autoTopUpHint')}
      </p>
    </div>
  );
};

const Stepper = ({
  label,
  suffix,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) => (
  <div className={'flex items-center justify-between gap-3 ' + (disabled ? 'opacity-40' : '')}>
    <span className="text-white/80 text-sm">{label}</span>
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={disabled || value <= min}
        aria-label={`Уменьшить: ${label}`}
        className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="min-w-[64px] text-center text-white font-bold text-sm">
        {value} {suffix}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={disabled || value >= max}
        aria-label={`Увеличить: ${label}`}
        className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

// ─── Пресеты ставок (подэкран) ───

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

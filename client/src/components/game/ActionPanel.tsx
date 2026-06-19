import { useEffect, useState } from 'react';
import { useDebugStore } from '../../store/debugStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  isOpenContext,
  calcOpenAmount,
  calcPostflopAmount,
  openPresetLabel,
  postflopPresetLabel,
} from '../../config/betPresets';
import type { BetPresets } from '../../config/betPresets';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';

interface ActionPanelProps {
  chips: number;
  currentBet: number;
  myBet: number;
  bigBlind: number;
  pot: number;
  phase: string;
  presets: BetPresets;
  displayMode: ChipDisplay;
  onAction: (action: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) => void;
  onRaiseOpenChange?: (open: boolean) => void; // раскрыт ли блок рейза — чтобы прятать кнопку меню под ним
}

// Компонент рендерится только когда мой ход (см. GameRoom.tsx).
// Это значит: каждый новый ход = новый mount = raiseAmount сбрасывается в minRaiseTotal,
// showRaise сбрасывается в false. Никаких ручных reset'ов не нужно.
export const ActionPanel = ({
  chips,
  currentBet,
  myBet,
  bigBlind,
  pot,
  phase,
  presets,
  displayMode,
  onAction,
  onRaiseOpenChange,
}: ActionPanelProps) => {
  const fmt = (n: number) => formatChips(n, bigBlind, displayMode);
  const actionStart = useDebugStore((s) => s.actionStart);
  const callAmount = Math.max(0, currentBet - myBet);
  const canCheck = callAmount === 0;
  const minRaiseTotal = Math.max(currentBet * 2, currentBet + bigBlind);
  const maxRaiseTotal = chips + myBet;
  const [raiseAmount, setRaiseAmount] = useState(minRaiseTotal);
  // Строковый черновик текстового поля рейза. Нужен, чтобы при очистке поле оставалось
  // ПУСТЫМ, а не показывало навязчивый «0» (Number('')→0). raiseAmount — числовой источник
  // правды (пресеты/слайдер/отправка); здесь только зеркалим его в строку и наоборот.
  const [raiseText, setRaiseText] = useState(() => String(minRaiseTotal));
  const [showRaise, setShowRaise] = useState(false);
  const canRaise = maxRaiseTotal > currentBet;

  // Clamp на случай если currentBet поменялся внутри одного хода (редко)
  useEffect(() => {
    setRaiseAmount((prev) => Math.min(Math.max(minRaiseTotal, prev), maxRaiseTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBet]);

  // Зеркалим число → строку, когда оно меняется НЕ из текстового поля (слайдер, пресеты,
  // MAX/MIN, clamp). При ручном вводе строки совпадут — лишних правок/скачков курсора нет.
  useEffect(() => {
    setRaiseText(String(raiseAmount));
  }, [raiseAmount]);

  // Сообщаем наружу, раскрыт ли блок рейза — GameRoom прячет кнопку меню, чтобы не мешала.
  // На размонтировании (конец хода) сбрасываем в false.
  useEffect(() => {
    onRaiseOpenChange?.(showRaise);
    return () => onRaiseOpenChange?.(false);
  }, [showRaise, onRaiseOpenChange]);

  // Хоткеи F/C/R/A (desktop). Не перехватываем когда фокус в input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key.toUpperCase();
      if (key === 'F') {
        actionStart('FOLD'); onAction('fold');
      } else if (key === 'C') {
        if (canCheck) { actionStart('CHECK'); onAction('check'); }
        else if (callAmount <= chips) { actionStart('CALL'); onAction('call'); }
      } else if (key === 'R') {
        if (!canRaise) return;
        if (!showRaise) { setShowRaise(true); return; }
        const amount = Math.min(Math.max(raiseAmount, minRaiseTotal), maxRaiseTotal);
        actionStart('RAISE'); onAction('raise', amount);
      } else if (key === 'A') {
        if (chips > 0) { actionStart('ALL-IN'); onAction('all-in'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCheck, canRaise, showRaise, raiseAmount, minRaiseTotal, maxRaiseTotal, callAmount, chips]);

  // Ввод в текстовое поле: пусто оставляем пустым (НЕ превращаем в 0); валидное число → в raiseAmount.
  const onRaiseTextChange = (v: string) => {
    setRaiseText(v);
    if (v === '') return;
    const n = Number(v);
    if (!Number.isNaN(n)) setRaiseAmount(n);
  };
  // На blur нормализуем: пусто / вне диапазона → ближайшее валидное.
  const commitRaiseText = () => {
    const n = Number(raiseText);
    const clamped =
      raiseText === '' || Number.isNaN(n)
        ? minRaiseTotal
        : Math.min(Math.max(n, minRaiseTotal), maxRaiseTotal);
    setRaiseAmount(clamped);
    setRaiseText(String(clamped));
  };

  // GGPoker-стиль: плоские «кнопки-клавиши» — мягкий градиент, тонкий верхний блик (before),
  // нижняя «ступенька»-тень + лёгкое нажатие (active:translate-y). Цвет задаётся per-button.
  const buttonBase =
    'relative flex-1 min-h-[44px] flex flex-col items-center justify-center px-1.5 sm:px-3 py-2 rounded-xl font-bold text-white leading-none transition-all disabled:opacity-30 disabled:cursor-not-allowed active:translate-y-px shadow-[0_3px_0_rgba(0,0,0,0.35),0_8px_18px_rgba(0,0,0,0.5)] ' +
    "before:content-[''] before:absolute before:inset-x-2 before:top-1 before:h-px before:bg-white/25 before:rounded-full before:pointer-events-none";

  const openCtx = isOpenContext(phase, currentBet, bigBlind);
  const calcCtx = {
    pot,
    currentBet,
    myBet,
    bigBlind,
    roundToBB: presets.roundToBigBlind,
  };

  const presetButtons = openCtx
    ? presets.open.map((p, i) => {
        const amount = calcOpenAmount(p, calcCtx);
        const clamped = Math.min(Math.max(amount, minRaiseTotal), maxRaiseTotal);
        const disabled = !canRaise || clamped <= currentBet;
        return {
          key: 'open-' + i,
          label: openPresetLabel(p),
          amount: clamped,
          disabled,
        };
      })
    : presets.postflop.map((p, i) => {
        const amount = calcPostflopAmount(p, calcCtx);
        const clamped = Math.min(Math.max(amount, minRaiseTotal), maxRaiseTotal);
        const disabled = !canRaise || clamped <= currentBet;
        return {
          key: 'pf-' + i,
          label: postflopPresetLabel(p),
          amount: clamped,
          disabled,
        };
      });

  const applyPreset = (amount: number, disabled: boolean) => {
    if (disabled) return;
    setRaiseAmount(amount);
  };

  // Двойной клик на Raise: первый — раскрыть, второй — отправить.
  // Если Raise отключён (нечем рейзить) — игнор.
  const handleRaiseClick = () => {
    if (!canRaise) return;
    if (!showRaise) {
      setShowRaise(true);
      return;
    }
    // Отправляем всегда зажатое в [min, max] значение — даже если поле пустое (берём raiseAmount).
    const amount = Math.min(Math.max(raiseAmount, minRaiseTotal), maxRaiseTotal);
    actionStart('RAISE');
    onAction('raise', amount);
  };

  return (
    <>
      {/* Mobile: вертикальный слайдер у правого края. Появляется только когда showRaise=true. */}
      <AnimatePresence>
        {showRaise && canRaise && (
          <motion.div
            key="mobile-vslider"
            data-noswipe
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="md:hidden fixed right-2 top-20 bottom-44 z-30 flex flex-col items-center gap-2 bg-black/75 backdrop-blur rounded-2xl border border-white/10 px-2 py-3 w-12"
          >
            <button
              type="button"
              onClick={() => setRaiseAmount(maxRaiseTotal)}
              className="text-[10px] font-bold text-white/80 hover:text-white"
            >
              MAX
            </button>
            <div className="text-poker-gold text-[10px] font-bold leading-tight text-center">
              {fmt(raiseAmount)}
            </div>
            <input
              type="range"
              min={minRaiseTotal}
              max={maxRaiseTotal}
              step={bigBlind}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              aria-orientation="vertical"
              className="accent-poker-gold flex-1"
              style={{
                writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
                direction: 'rtl',
                width: '24px',
              }}
            />
            <button
              type="button"
              onClick={() => setRaiseAmount(minRaiseTotal)}
              className="text-[10px] font-bold text-white/80 hover:text-white"
            >
              MIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        data-noswipe
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl px-3 sm:px-4 pb-[env(safe-area-inset-bottom)] z-30"
      >
        <div className="bg-black/70 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/10 space-y-2 sm:space-y-3">
          <AnimatePresence initial={false}>
            {showRaise && canRaise && (
              <motion.div
                key="raise-block"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden space-y-2 sm:space-y-3"
              >
                <div className="flex gap-1.5 sm:gap-2">
                  {presetButtons.map((b) => {
                    const active = raiseAmount === b.amount && !b.disabled;
                    return (
                      <motion.button
                        key={b.key}
                        whileHover={!b.disabled ? { scale: 1.03 } : {}}
                        whileTap={!b.disabled ? { scale: 0.97 } : {}}
                        disabled={b.disabled}
                        onClick={() => applyPreset(b.amount, b.disabled)}
                        className={
                          'flex-1 min-h-[40px] sm:min-h-[44px] px-1 sm:px-2 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ' +
                          (active
                            ? 'bg-emerald-500/30 text-white ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20'
                            : 'bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10')
                        }
                      >
                        <div className="leading-tight">{b.label}</div>
                        <div className="text-[10px] sm:text-xs font-normal opacity-70 leading-tight">
                          {fmt(b.amount)}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Desktop: горизонтальный слайдер + num-input.
                    Mobile: только num-input в центре (slider — вертикальный сбоку). */}
                <div className="hidden md:flex items-center gap-3">
                  <input
                    type="range"
                    min={minRaiseTotal}
                    max={maxRaiseTotal}
                    step={bigBlind}
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="flex-1 accent-poker-gold min-w-0"
                  />
                  <input
                    type="number"
                    min={minRaiseTotal}
                    max={maxRaiseTotal}
                    value={raiseText}
                    onChange={(e) => onRaiseTextChange(e.target.value)}
                    onBlur={commitRaiseText}
                    className="w-24 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-white text-base text-right outline-none focus:border-poker-gold"
                  />
                </div>
                <div className="md:hidden flex items-center justify-center">
                  <input
                    type="number"
                    min={minRaiseTotal}
                    max={maxRaiseTotal}
                    value={raiseText}
                    onChange={(e) => onRaiseTextChange(e.target.value)}
                    onBlur={commitRaiseText}
                    className="w-28 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-white text-sm text-center outline-none focus:border-poker-gold"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-1.5 sm:gap-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { actionStart('FOLD'); onAction('fold'); }}
              className={
                buttonBase +
                ' bg-gradient-to-b from-slate-600 to-slate-700 ring-1 ring-black/30'
              }
            >
              <span className="relative z-10 flex flex-col items-center leading-none">
                <span className="text-sm sm:text-base">Fold</span>
                <span className="hidden md:block text-[9px] opacity-30 mt-0.5 font-normal tracking-widest">[F]</span>
              </span>
            </motion.button>

            {canCheck ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { actionStart('CHECK'); onAction('check'); }}
                className={
                  buttonBase +
                  ' bg-gradient-to-b from-emerald-500 to-emerald-600 ring-1 ring-black/20'
                }
              >
                <span className="relative z-10 flex flex-col items-center leading-none">
                  <span className="text-sm sm:text-base">Check</span>
                  <span className="hidden md:block text-[9px] opacity-30 mt-0.5 font-normal tracking-widest">[C]</span>
                </span>
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                disabled={callAmount > chips}
                onClick={() => { actionStart('CALL'); onAction('call'); }}
                className={
                  buttonBase +
                  ' bg-gradient-to-b from-emerald-500 to-emerald-600 ring-1 ring-black/20'
                }
              >
                <span className="relative z-10 flex flex-col items-center leading-none">
                  <span className="text-sm sm:text-base">Call</span>
                  <span className="text-[10px] sm:text-xs font-semibold opacity-85 mt-0.5">{fmt(callAmount)}</span>
                  <span className="hidden md:block text-[9px] opacity-30 mt-0.5 font-normal tracking-widest">[C]</span>
                </span>
              </motion.button>
            )}

            <motion.button
              whileHover={canRaise ? { scale: 1.03 } : {}}
              whileTap={canRaise ? { scale: 0.97 } : {}}
              disabled={!canRaise}
              onClick={handleRaiseClick}
              className={
                buttonBase +
                ' bg-gradient-to-b from-rose-500 to-red-600 ring-1 ring-black/20 ' +
                (showRaise ? 'ring-2 ring-amber-300' : '')
              }
            >
              <span className="relative z-10 flex flex-col items-center leading-none">
                <span className="text-sm sm:text-base">{showRaise ? '✓ Raise' : 'Raise'}</span>
                {showRaise && (
                  <span className="text-[10px] sm:text-xs font-semibold opacity-85 mt-0.5">{fmt(raiseAmount)}</span>
                )}
                <span className="hidden md:block text-[9px] opacity-30 mt-0.5 font-normal tracking-widest">[R]</span>
              </span>
            </motion.button>

            <motion.button
              whileHover={chips > 0 ? { scale: 1.03 } : {}}
              whileTap={chips > 0 ? { scale: 0.97 } : {}}
              disabled={chips === 0}
              onClick={() => { actionStart('ALL-IN'); onAction('all-in'); }}
              className={
                buttonBase +
                ' bg-gradient-to-b from-amber-400 to-amber-600 ring-1 ring-black/20'
              }
            >
              <span className="relative z-10 flex flex-col items-center leading-none">
                <span className="text-sm sm:text-base">All-In</span>
                <span className="text-[10px] sm:text-xs font-semibold opacity-85 mt-0.5">{fmt(chips)}</span>
                <span className="hidden md:block text-[9px] opacity-30 mt-0.5 font-normal tracking-widest">[A]</span>
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

import { useEffect, useState } from 'react';
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
}: ActionPanelProps) => {
  const fmt = (n: number) => formatChips(n, bigBlind, displayMode);
  const callAmount = Math.max(0, currentBet - myBet);
  const canCheck = callAmount === 0;
  const minRaiseTotal = Math.max(currentBet * 2, currentBet + bigBlind);
  const maxRaiseTotal = chips + myBet;
  const [raiseAmount, setRaiseAmount] = useState(minRaiseTotal);
  const [showRaise, setShowRaise] = useState(false);

  // Clamp на случай если currentBet поменялся внутри одного хода (редко)
  useEffect(() => {
    setRaiseAmount((prev) => Math.min(Math.max(minRaiseTotal, prev), maxRaiseTotal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBet]);

  const canRaise = maxRaiseTotal > currentBet;

  const buttonBase =
    'flex-1 min-h-[44px] px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl font-bold text-white text-sm sm:text-base shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed';

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
    onAction('raise', raiseAmount);
  };

  return (
    <>
      {/* Mobile: вертикальный слайдер у правого края. Появляется только когда showRaise=true. */}
      <AnimatePresence>
        {showRaise && canRaise && (
          <motion.div
            key="mobile-vslider"
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
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl px-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-30"
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
                          'flex-1 min-h-[40px] sm:min-h-[44px] px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ' +
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
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="w-24 bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-white text-base text-right outline-none focus:border-poker-gold"
                  />
                </div>
                <div className="md:hidden flex items-center justify-center">
                  <input
                    type="number"
                    min={minRaiseTotal}
                    max={maxRaiseTotal}
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
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
              onClick={() => onAction('fold')}
              className={buttonBase + ' bg-gradient-to-r from-red-600 to-rose-700'}
            >
              Fold
            </motion.button>

            {canCheck ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onAction('check')}
                className={buttonBase + ' bg-gradient-to-r from-gray-600 to-gray-700'}
              >
                Check
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                disabled={callAmount > chips}
                onClick={() => onAction('call')}
                className={buttonBase + ' bg-gradient-to-r from-blue-600 to-indigo-700'}
              >
                Call {fmt(callAmount)}
              </motion.button>
            )}

            <motion.button
              whileHover={canRaise ? { scale: 1.03 } : {}}
              whileTap={canRaise ? { scale: 0.97 } : {}}
              disabled={!canRaise}
              onClick={handleRaiseClick}
              className={
                buttonBase +
                ' bg-gradient-to-r from-emerald-500 to-green-600 ' +
                (showRaise ? 'ring-2 ring-emerald-300' : '')
              }
            >
              {showRaise ? '✓ Raise ' + fmt(raiseAmount) : 'Raise'}
            </motion.button>

            <motion.button
              whileHover={chips > 0 ? { scale: 1.03 } : {}}
              whileTap={chips > 0 ? { scale: 0.97 } : {}}
              disabled={chips === 0}
              onClick={() => onAction('all-in')}
              className={buttonBase + ' bg-gradient-to-r from-yellow-500 to-red-600'}
            >
              All-In {fmt(chips)}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

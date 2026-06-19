import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

// Переиспользуемые контролы модалки создания стола (эталон 2026-06-05, тёмный + emerald-акцент).
// Виджеты «тупые» (controlled): значение + onChange снаружи. Дизайн 1:1 со скриншотами.

// Тоггл-переключатель (зелёный при включении).
export const Toggle = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
    className={
      'relative w-12 h-7 rounded-full transition-colors shrink-0 ' +
      (disabled ? 'opacity-40 cursor-not-allowed ' : '') +
      (checked ? 'bg-emerald-500' : 'bg-gray-600')
    }
  >
    <span
      className={'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ' + (checked ? 'left-6' : 'left-1')}
    />
  </button>
);

// Степпер «− [значение] +».
export const Stepper = ({
  display,
  onDec,
  onInc,
  disabled,
}: {
  display: ReactNode;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}) => (
  <div className={'flex items-center gap-2 ' + (disabled ? 'opacity-40' : '')}>
    <button
      type="button"
      disabled={disabled}
      onClick={onDec}
      className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-lg leading-none flex items-center justify-center disabled:cursor-not-allowed"
    >
      −
    </button>
    <div className="min-w-[120px] text-center px-4 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm font-bold">
      {display}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={onInc}
      className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-lg leading-none flex items-center justify-center disabled:cursor-not-allowed"
    >
      +
    </button>
  </div>
);

// Сегмент-кнопки (активная — зелёная рамка). T — тип значения.
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={'flex flex-wrap gap-2 ' + (disabled ? 'opacity-40' : '')}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={
              'px-3 py-2 rounded-lg text-sm font-semibold border transition-all disabled:cursor-not-allowed ' +
              (active
                ? 'border-emerald-500 text-white bg-emerald-500/10'
                : 'border-white/10 text-gray-400 bg-gray-800 hover:border-emerald-500/40')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Дропдаун (стилизованный select) в стиле эталона.
export function Dropdown<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
}) {
  const isNum = typeof value === 'number';
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange((isNum ? Number(e.target.value) : e.target.value) as T)}
        className="appearance-none bg-gray-800 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-white text-sm outline-none focus:border-emerald-500 disabled:opacity-40 cursor-pointer min-w-[110px]"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

// Одиночный слайдер.
export const RangeSlider = ({
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) => (
  <input
    type="range"
    min={min}
    max={max}
    step={step}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full accent-emerald-500 disabled:opacity-40"
  />
);

// Двойной слайдер (две ручки на одном треке: low/high) — для диапазона бай-ина.
// Два наложенных нативных input[range]; pointer-events на ручках (см. .dual-range в index.css).
export const DualRangeSlider = ({
  min,
  max,
  step,
  low,
  high,
  onChange,
  disabled,
}: {
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  disabled?: boolean;
}) => {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className={'relative h-6 flex items-center ' + (disabled ? 'opacity-40' : '')}>
      <div className="absolute left-0 right-0 h-1.5 rounded-full bg-gray-600" />
      <div
        className="absolute h-1.5 rounded-full bg-emerald-500"
        style={{ left: pct(low) + '%', right: 100 - pct(high) + '%' }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={low}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        className="dual-range absolute left-0 right-0 w-full"
        style={{ zIndex: low >= max - (max - min) * 0.05 ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={high}
        disabled={disabled}
        onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        className="dual-range absolute left-0 right-0 w-full"
        style={{ zIndex: 4 }}
      />
    </div>
  );
};

// Синяя инфо-кнопка «i» (открывает bottom-sheet).
export const InfoButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Подробнее"
    className="w-4 h-4 rounded-full bg-blue-500 hover:bg-blue-400 text-white text-[10px] font-bold leading-none flex items-center justify-center shrink-0"
  >
    i
  </button>
);

// Строка настройки: label (+ инфо/«скоро») слева, контрол справа, нижний разделитель.
export const SettingRow = ({
  label,
  onInfo,
  soon,
  disabled,
  children,
}: {
  label: string;
  onInfo?: () => void;
  soon?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <div className={'flex items-center justify-between gap-3 py-3 border-b border-white/5 ' + (disabled ? 'opacity-50' : '')}>
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm text-white truncate">{label}</span>
      {onInfo && <InfoButton onClick={onInfo} />}
      {soon && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">скоро</span>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// Bottom-sheet с пояснением (для инфо-«i»).
export const InfoSheet = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={(e) => {
      e.stopPropagation(); // не всплывать на оверлей модалки (иначе закроется вся модалка)
      onClose();
    }}
    className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
  >
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-md bg-gray-900 rounded-t-3xl border-t border-white/10 p-5 max-h-[75vh] overflow-y-auto"
    >
      <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <div className="text-sm text-gray-300 space-y-1.5">{children}</div>
    </motion.div>
  </motion.div>
);

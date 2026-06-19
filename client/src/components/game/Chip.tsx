import { memo } from 'react';
import { denomLabel, CHIP_TEXT_DARK } from '../../config/chipDenoms';
import type { ChipColorName } from '../../config/chipDenoms';

// Одна фишка: SVG-картинка (client/public/chips/chip-<color>.svg) + номинал по центру.
// Номинал рисуется тут (в SVG центр пустой) — значение зависит от номинала.
interface ChipProps {
  color: ChipColorName;
  value: number; // в центах — для подписи по центру
  size?: number; // px
}

const ChipImpl = ({ color, value, size = 24 }: ChipProps) => {
  const dark = CHIP_TEXT_DARK.has(color);
  const label = denomLabel(value);
  // Кегль под длину подписи, чтобы длинные («0.01» 4 симв.) не вылазили за фишку.
  const scale = label.length >= 4 ? 0.24 : label.length === 3 ? 0.3 : label.length === 2 ? 0.36 : 0.42;
  return (
    <div className="relative shrink-0 select-none" style={{ width: size, height: size }}>
      <img
        src={import.meta.env.BASE_URL + 'chips/chip-' + color + '.svg'}
        alt=""
        draggable={false}
        className="w-full h-full block"
      />
      <span
        className="absolute inset-0 flex items-center justify-center font-black tabular-nums leading-none"
        style={{
          fontSize: Math.round(size * scale),
          color: dark ? '#1a1a1a' : '#ffffff',
          textShadow: dark ? '0 1px 1px rgba(255,255,255,0.4)' : '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        {label}
      </span>
    </div>
  );
};

export const Chip = memo(ChipImpl);

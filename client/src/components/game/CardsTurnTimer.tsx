// Таймер хода для hero — прямоугольная рамка вокруг МОИХ карт (аватарки у меня нет,
// поэтому круговое TurnProgressRing заменяется на рамку по периметру карт).
// Периметр опустошается по проценту оставшегося времени; цвета/варианты — общие с кольцом.
//
// Почему меряем размер ResizeObserver'ом: pathLength на <rect> браузеры поддерживают
// ненадёжно — без реального периметра dash-pattern «бежит» по кругу вместо убывания.
// Поэтому берём фактический w/h и считаем настоящий периметр (как в круговом кольце).

import { useEffect, useRef, useState } from 'react';
import { TURN_COLORS } from './turnColors';
import type { TurnVariant } from './turnColors';

interface CardsTurnTimerProps {
  percent: number; // 0..100 — сколько оставшегося времени
  secondsLeft: number; // число для бейджа
  variant: TurnVariant;
}

const SW = 3; // толщина рамки, px
const RX = 6; // радиус скругления углов, px

export const CardsTurnTimer = ({ percent, secondsLeft, variant }: CardsTurnTimerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colors = TURN_COLORS[variant];
  const clamped = Math.max(0, Math.min(100, percent));
  const isUrgent = variant === 'turn-urgent' || variant === 'timebank';

  // Прямоугольник вписан внутрь на половину толщины, чтобы линия не обрезалась краем SVG.
  const w = Math.max(0, box.w - SW);
  const h = Math.max(0, box.h - SW);
  const rx = Math.min(RX, w / 2, h / 2);
  // Точный периметр скруглённого прямоугольника: прямые стороны минус срезанные углы + дуги.
  const perim = 2 * (w + h) - 8 * rx + 2 * Math.PI * rx;
  const dashoffset = perim * (1 - clamped / 100);

  return (
    <div
      ref={ref}
      className={
        'absolute inset-[-8px] pointer-events-none z-10 ' +
        (variant === 'turn-urgent' ? 'animate-timer-shake' : '')
      }
    >
      {box.w > 0 && (
        <svg width={box.w} height={box.h} className={isUrgent ? 'animate-pulse' : ''}>
          {/* Дорожка (фон рамки) */}
          <rect
            x={SW / 2}
            y={SW / 2}
            width={w}
            height={h}
            rx={rx}
            fill="none"
            stroke={colors.track}
            strokeWidth={SW}
          />
          {/* Прогресс — убывает по периметру */}
          <rect
            x={SW / 2}
            y={SW / 2}
            width={w}
            height={h}
            rx={rx}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={perim}
            strokeDashoffset={dashoffset}
            style={{ transition: 'stroke-dashoffset 200ms linear' }}
          />
        </svg>
      )}
      {/* Число секунд — бейдж по центру над картами */}
      <div
        className={
          'absolute -top-2.5 left-1/2 -translate-x-1/2 min-w-[22px] h-[22px] px-1 rounded-full text-[12px] font-black flex items-center justify-center shadow border ' +
          colors.badge
        }
      >
        {secondsLeft}
      </div>
    </div>
  );
};

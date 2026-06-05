// SVG-кольцо прогресса для таймера хода: огибает аватар, заполняется/опустошается по мере истечения.
// Phase 1 (основной): жёлтое >5с, красное ≤5с. Phase 2 (таймбанк): оранжевое.
// Размер привязан к диаметру аватара (size). Внутри пусто — снаружи аватара тонкое кольцо.

interface TurnProgressRingProps {
  size: number;            // диаметр аватара, px (кольцо рисуется чуть-чуть больше)
  percent: number;         // 0..100 — сколько оставшегося времени; 100 = полное кольцо
  secondsLeft: number;     // число для подписи (показывается мини-бейджем сверху-слева)
  variant: 'turn' | 'turn-urgent' | 'timebank';
  strokeWidth?: number;    // толщина кольца (дефолт 3)
}

const COLOR: Record<TurnProgressRingProps['variant'], { stroke: string; track: string; badge: string }> = {
  turn: {
    stroke: '#fbbf24',           // amber-400 (poker-gold-like)
    track: 'rgba(255,255,255,0.08)',
    badge: 'bg-amber-400 text-black border-amber-700',
  },
  'turn-urgent': {
    stroke: '#ef4444',           // red-500
    track: 'rgba(239,68,68,0.15)',
    badge: 'bg-red-600 text-white border-red-900',
  },
  timebank: {
    stroke: '#f97316',           // orange-500
    track: 'rgba(249,115,22,0.15)',
    badge: 'bg-orange-500 text-white border-orange-900',
  },
};

export const TurnProgressRing = ({
  size,
  percent,
  secondsLeft,
  variant,
  strokeWidth = 3,
}: TurnProgressRingProps) => {
  // Внешний диаметр кольца чуть больше аватара, чтобы не съесть его края.
  const ringSize = size + strokeWidth * 2;
  const r = (ringSize - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  // Заполнение «обратное» — то, что осталось. Стартуем сверху (rotate -90).
  const dashoffset = c * (1 - clamped / 100);
  const colors = COLOR[variant];
  const isUrgent = variant === 'turn-urgent' || variant === 'timebank';
  // Shake-анимация только для основной фазы при <5с (turn-urgent), не для таймбанка.
  const isTurnUrgent = variant === 'turn-urgent';

  return (
    <div
      className={'absolute pointer-events-none' + (isTurnUrgent ? ' animate-timer-shake' : '')}
      style={{
        width: ringSize,
        height: ringSize,
        // Центрируем кольцо вокруг аватара: смещаем на strokeWidth в каждую сторону назад.
        top: -strokeWidth,
        left: -strokeWidth,
      }}
    >
      <svg width={ringSize} height={ringSize} className={isUrgent ? 'animate-pulse' : ''}>
        {/* Дорожка (фон) */}
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={r}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        {/* Прогресс */}
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={r}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashoffset}
          transform={'rotate(-90 ' + ringSize / 2 + ' ' + ringSize / 2 + ')'}
          style={{ transition: 'stroke-dashoffset 200ms linear' }}
        />
      </svg>
      {/* Число секунд — мини-бейдж у верхнего-левого угла кольца */}
      <div
        className={
          'absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center shadow border ' +
          colors.badge
        }
      >
        {secondsLeft}
      </div>
    </div>
  );
};

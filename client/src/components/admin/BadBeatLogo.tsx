// SVG-логотип «BAD BEAT» — неон-вывеска под бренд: градиентная заливка (magenta→violet→cyan),
// яркая обводка, многослойное свечение (feGaussianBlur+feMerge) и подсветка-стрик снизу.
// Self-contained, масштаб по высоте через className (h-…), ширина — авто.
export const BadBeatLogo = ({ className = 'h-16' }: { className?: string }) => (
  <svg viewBox="0 0 240 140" className={className} role="img" aria-label="BAD BEAT" style={{ width: 'auto' }}>
    <defs>
      {/* Градиент букв: электрик-magenta → фиолет → cyan по диагонали */}
      <linearGradient id="bbFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff4fe0" />
        <stop offset="50%" stopColor="#b96bff" />
        <stop offset="100%" stopColor="#2ee6ff" />
      </linearGradient>
      {/* Градиент стрика снизу */}
      <linearGradient id="bbStreak" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ff2bd6" stopOpacity="0" />
        <stop offset="50%" stopColor="#ff2bd6" />
        <stop offset="100%" stopColor="#2ee6ff" stopOpacity="0" />
      </linearGradient>
      {/* Неон: дальнее magenta + ближнее cyan свечение, поверх — исходная графика */}
      <filter id="bbGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b1" />
        <feFlood floodColor="#ff2bd6" floodOpacity="0.95" result="c1" />
        <feComposite in="c1" in2="b1" operator="in" result="g1" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="b2" />
        <feFlood floodColor="#2ee6ff" result="c2" />
        <feComposite in="c2" in2="b2" operator="in" result="g2" />
        <feMerge>
          <feMergeNode in="g1" />
          <feMergeNode in="g2" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Подсветка-стрик под BEAT */}
    <rect x="28" y="124" width="184" height="3.5" rx="1.75" fill="url(#bbStreak)" filter="url(#bbGlow)" />

    {/* Текст: градиент-заливка + яркая обводка + неон-glow */}
    <g
      filter="url(#bbGlow)"
      fill="url(#bbFill)"
      stroke="#f4faff"
      strokeWidth="0.8"
      fontWeight={900}
      fontStyle="italic"
      textAnchor="middle"
      style={{ fontFamily: 'inherit', letterSpacing: '1px' }}
    >
      <text x="120" y="58" fontSize="56">BAD</text>
      <text x="120" y="116" fontSize="56">BEAT</text>
    </g>
  </svg>
);

// Палитра таймера хода — общая для TurnProgressRing (кольцо вокруг аватара) и CardsTurnTimer
// (рамка-таймер вокруг моих карт). Вынесено из TurnProgressRing.tsx в отдельный модуль, чтобы
// файл-компонент экспортировал только компонент (правило react-refresh/only-export-components).

export type TurnVariant = 'turn' | 'turn-urgent' | 'timebank';

export const TURN_COLORS: Record<TurnVariant, { stroke: string; track: string; badge: string }> = {
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

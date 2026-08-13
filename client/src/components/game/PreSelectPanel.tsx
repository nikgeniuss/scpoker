import { memo } from 'react';

export type PreSelectAction = 'fold' | 'check-fold' | 'call-any';

interface PreSelectPanelProps {
  value: PreSelectAction | null;
  onChange: (v: PreSelectAction | null) => void;
}

const OPTS: { id: PreSelectAction; label: string }[] = [
  { id: 'fold', label: 'Fold' },
  { id: 'check-fold', label: 'Check / Fold' },
  { id: 'call-any', label: 'Call Any' },
];

// memo: GameRoom ре-рендерится на каждый GAME_UPDATE (то есть на каждое чужое действие за
// столом) — без memo эта панель пересоздавалась бы вместе с ним, хотя её пропсы (value/onChange)
// меняются только когда игрок сам тапнул чекбокс. На бот-столах (быстрые ходы) это давало лаги.
export const PreSelectPanel = memo(({ value, onChange }: PreSelectPanelProps) => (
  <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] z-30">
    <div className="flex justify-center gap-2">
      {OPTS.map(opt => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(active ? null : opt.id)}
            className={
              'flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ' +
              (active
                ? 'bg-white/12 border-white/30 text-white shadow-lg'
                : 'bg-black/50 border-white/8 text-white/35 hover:text-white/60 hover:border-white/15')
            }
          >
            <span className={
              'w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ' +
              (active ? 'bg-emerald-500 border-emerald-400' : 'border-white/15')
            }>
              {active && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
));

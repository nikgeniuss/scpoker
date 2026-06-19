// Рендер карт для экранов Bad Beat Jackpot (admin). Константы/конструкторы рук — в badBeatHands.ts.
import { SUIT } from './badBeatHands';
import type { PlayingCard } from './badBeatHands';

type CardSize = 'sm' | 'md';

const SIZE = {
  md: { box: 'w-9 h-12', rank: 'text-sm', suit: 'text-sm', gap: 'gap-1' },
  sm: { box: 'w-6 h-8', rank: 'text-[10px]', suit: 'text-[10px]', gap: 'gap-0.5' },
};

export const MiniCard = ({ rank, suit, size = 'md' }: PlayingCard & { size?: CardSize }) => {
  const s = SIZE[size];
  return (
    <div
      className={
        s.box +
        ' rounded-md bg-neutral-800 border border-white/10 flex flex-col items-center justify-center leading-none'
      }
    >
      <span className={s.rank + ' font-bold text-white'}>{rank}</span>
      <span className={s.suit} style={{ color: SUIT[suit].color }}>
        {SUIT[suit].sym}
      </span>
    </div>
  );
};

export const HandCards = ({ cards, size = 'md' }: { cards: PlayingCard[]; size?: CardSize }) => (
  <div className={'flex ' + SIZE[size].gap}>
    {cards.map((c, i) => (
      <MiniCard key={i} rank={c.rank} suit={c.suit} size={size} />
    ))}
  </div>
);

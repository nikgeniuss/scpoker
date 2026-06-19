// Константы мастей и конструкторы рук для экранов Bad Beat Jackpot (admin).
// Отделено от badBeatCards.tsx (компоненты), чтобы не ломать react-refresh (§0.11).

// Масти 4-цветной колоды (как на эталоне): пика — серая, бубна — синяя, черва — красная, трефа — зелёная.
export const SUIT = {
  s: { sym: '♠', color: '#e5e7eb' },
  d: { sym: '♦', color: '#3b82f6' },
  h: { sym: '♥', color: '#ef4444' },
  c: { sym: '♣', color: '#22c55e' },
};
export type SuitKey = keyof typeof SUIT;
export interface PlayingCard {
  rank: string;
  suit: SuitKey;
}

const SUITS_ORDER: SuitKey[] = ['s', 'd', 'h', 'c'];

// Каре: 4 одинаковых ранга по мастям s/d/h/c.
export const makeQuads = (rank: string): PlayingCard[] =>
  SUITS_ORDER.map((suit) => ({ rank, suit }));

// Сет + пара (напр. AAAJJ): 3 карты r3 (s/d/h) + 2 карты r2 (s/d).
export const makeTripsPair = (r3: string, r2: string): PlayingCard[] => [
  { rank: r3, suit: 's' },
  { rank: r3, suit: 'd' },
  { rank: r3, suit: 'h' },
  { rank: r2, suit: 's' },
  { rank: r2, suit: 'd' },
];

// Стрит-флеш из 5 рангов одной масти (для PLO5 на эталоне; у нас не используется, но пусть будет).
export const makeStraightFlush = (ranks: string[], suit: SuitKey = 's'): PlayingCard[] =>
  ranks.map((rank) => ({ rank, suit }));

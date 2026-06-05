// Цветовая схема мастей в колоде (см. roadmap 10.3 в CLAUDE.md)
// set1: стандарт — hearts/diamonds красные, clubs/spades чёрные.
// set2: трёхцветная — hearts красные, diamonds синие, clubs/spades чёрные.
// set3: четырёхцветная — hearts красные, diamonds синие, clubs зелёные, spades чёрные.

export type CardColorScheme = 'set1' | 'set2' | 'set3';

export const DEFAULT_CARD_COLOR_SCHEME: CardColorScheme = 'set1';

const STORAGE_KEY = 'sk:cardColors:v1';

export const CARD_COLOR_SCHEMES: { id: CardColorScheme; label: string; hint: string }[] = [
  { id: 'set1', label: '2 цвета', hint: 'Стандарт' },
  { id: 'set2', label: '3 цвета', hint: '♦ синяя' },
  { id: 'set3', label: '4 цвета', hint: '♦ синяя, ♣ зелёная' },
];

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export function loadCardColors(): CardColorScheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'set1' || v === 'set2' || v === 'set3') return v;
    return DEFAULT_CARD_COLOR_SCHEME;
  } catch {
    return DEFAULT_CARD_COLOR_SCHEME;
  }
}

export function saveCardColors(v: CardColorScheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

// Tailwind text-color класс для масти в выбранной схеме
export function suitColorClass(suit: Suit, scheme: CardColorScheme): string {
  if (scheme === 'set1') {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-gray-900';
  }
  if (scheme === 'set2') {
    if (suit === 'hearts') return 'text-red-600';
    if (suit === 'diamonds') return 'text-blue-600';
    return 'text-gray-900';
  }
  // set3
  if (suit === 'hearts') return 'text-red-600';
  if (suit === 'diamonds') return 'text-blue-600';
  if (suit === 'clubs') return 'text-green-700';
  return 'text-gray-900';
}

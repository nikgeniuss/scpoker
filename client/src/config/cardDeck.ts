// Выбор колоды игроком (персональный, перебивает глобальную настройку лица карт).
// 'classic' — наша стандартная SVG-колода (images/classic, faceStyle='classic').
// 'colored' — «цветные»: вся карта залита цветом масти (черва=красная, бубна=синяя,
//             трефа=зелёная, пика=чёрная), ранг/масть белым. Рендерится в Card.tsx CSS-ветке
//             и имеет приоритет над картиночной колодой.
// Карусель в «Настройках Игры» выбирает именно это (см. GameSettingsModal).

import type { Suit } from '@poker-room/shared';

export type CardDeck = 'classic' | 'colored';

export const DEFAULT_CARD_DECK: CardDeck = 'classic';

const STORAGE_KEY = 'sk:cardDeck:v1';

export const CARD_DECKS: { id: CardDeck; label: string; hint: string }[] = [
  { id: 'classic', label: 'Классическая', hint: 'стандартная колода' },
  { id: 'colored', label: 'Цветные', hint: 'масть = цвет карты' },
];

export function loadCardDeck(): CardDeck {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'colored' ? 'colored' : 'classic';
  } catch {
    return DEFAULT_CARD_DECK;
  }
}

export function saveCardDeck(v: CardDeck): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

// Сплошная заливка карты по масти для колоды 'colored'. Tailwind bg-классы.
export function suitSolidBgClass(suit: Suit): string {
  if (suit === 'hearts') return 'bg-red-600';
  if (suit === 'diamonds') return 'bg-blue-700';
  if (suit === 'clubs') return 'bg-green-700';
  return 'bg-zinc-900'; // spades
}

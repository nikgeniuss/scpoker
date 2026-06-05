// Базовые доменные типы карт и фаз — единый ВНУТРИСЕРВЕРНЫЙ источник правды.
// Это вынужденный дубль shared/index.ts: сервер не может импортировать shared из-за
// rootDir: "./src" в server/tsconfig (см. CLAUDE.md §3, docs/ARCHITECTURE.md «Грабли»).
// Заменяет россыпь локальных копий Suit/Rank/Card в deck.ts/hands.ts/GameManager.ts/
// botBrain.ts/decks.ts/__tests__/helpers/cards.ts — теперь один файл вместо шести.
// Формат-зависимые правки (напр. Шорт-дэк: убрать 2–5 из Rank) делаются здесь, в одном месте.

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type RoomStatus = 'waiting' | 'playing';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

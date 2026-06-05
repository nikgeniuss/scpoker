import { type Card, SUITS, RANKS } from './types.js';

// Создать новую колоду (52 карты)
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

// Перетасовать колоду (алгоритм Fisher-Yates)
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Раздать карты игрокам (по 2 каждому)
export function dealCards(deck: Card[], playerCount: number): { hands: Card[][]; remainingDeck: Card[] } {
  const hands: Card[][] = [];
  const deckCopy = [...deck];

  for (let i = 0; i < playerCount; i++) {
    const card1 = deckCopy.pop()!;
    const card2 = deckCopy.pop()!;
    hands.push([card1, card2]);
  }

  return { hands, remainingDeck: deckCopy };
}

// Раздать общие карты (flop = 3, turn = 1, river = 1)
export function dealCommunityCards(deck: Card[], count: number): { cards: Card[]; remainingDeck: Card[] } {
  const deckCopy = [...deck];
  const cards: Card[] = [];

  // Сжигаем одну карту перед раздачей
  deckCopy.pop();

  for (let i = 0; i < count; i++) {
    const card = deckCopy.pop()!;
    cards.push(card);
  }

  return { cards, remainingDeck: deckCopy };
}

// Вернуть РЕАЛЬНЫЕ будущие community-карты (без burn'ов) для админ-peek и бот-логики.
// Учитывает порядок dealCommunityCards: pop burn → pop N карт. То есть «вершина» deck'а
// (последний индекс массива) — это первый pop. Нужно идти с конца к началу и пропускать
// burn-карты в правильных позициях.
//
// alreadyOnBoard: сколько community-карт уже открыто (0 = префлоп, 3 = флоп, 4 = тёрн, 5 = ривер).
export function getFutureBoardCards(deck: Card[], alreadyOnBoard: number): Card[] {
  const result: Card[] = [];
  let pos = deck.length - 1; // вершина стека

  if (alreadyOnBoard === 0) {
    // Префлоп → ещё нужны flop (3) + turn + river. Burn перед каждым stage.
    if (pos >= 0) pos--; // burn перед flop
    for (let i = 0; i < 3 && pos >= 0; i++) result.push(deck[pos--]); // flop1, flop2, flop3
    if (pos >= 0) pos--; // burn перед turn
    if (pos >= 0) result.push(deck[pos--]); // turn
    if (pos >= 0) pos--; // burn перед river
    if (pos >= 0) result.push(deck[pos--]); // river
  } else if (alreadyOnBoard === 3) {
    // Флоп открыт → нужны turn + river. На deck'е лежат burn(turn) → turn → burn(river) → river.
    if (pos >= 0) pos--; // burn перед turn
    if (pos >= 0) result.push(deck[pos--]); // turn
    if (pos >= 0) pos--; // burn перед river
    if (pos >= 0) result.push(deck[pos--]); // river
  } else if (alreadyOnBoard === 4) {
    // Тёрн открыт → нужен river. На deck'е: burn(river) → river.
    if (pos >= 0) pos--; // burn перед river
    if (pos >= 0) result.push(deck[pos--]); // river
  }
  // alreadyOnBoard === 5 — всё открыто, future = []
  return result;
}
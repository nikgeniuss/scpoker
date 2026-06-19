import { type Card, type Rank, type GameFormat } from './types.js';

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

type HandRank =
  'high-card' | 'pair' | 'two-pair' | 'three-of-a-kind' |
  'straight' | 'flush' | 'full-house' | 'four-of-a-kind' |
  'straight-flush' | 'royal-flush';

const HAND_VALUES: Record<HandRank, number> = {
  'high-card': 1,
  'pair': 2,
  'two-pair': 3,
  'three-of-a-kind': 4,
  'straight': 5,
  'flush': 6,
  'full-house': 7,
  'four-of-a-kind': 8,
  'straight-flush': 9,
  'royal-flush': 10,
};

// Шорт-дэк (Triton): флеш бьёт фулл-хаус. Меняем местами только эти два значения,
// остальные категории сохраняют порядок (стрит > сет и т.д.).
const SHORT_DECK_HAND_VALUES: Record<HandRank, number> = {
  ...HAND_VALUES,
  'flush': 7,
  'full-house': 6,
};

function handValues(format: GameFormat): Record<HandRank, number> {
  return format === 'shortdeck' ? SHORT_DECK_HAND_VALUES : HAND_VALUES;
}

// Младшие ранги для «колесо»-стрита по формату: NLH → A-2-3-4-5, Шорт-дэк → A-6-7-8-9.
function wheelLowRanks(format: GameFormat): number[] {
  return format === 'shortdeck' ? [6, 7, 8, 9] : [2, 3, 4, 5];
}

interface HandResult {
  rank: HandRank;
  value: number;
  highCards: number[];
  cards: Card[]; // 5 карт, образующих лучшую комбинацию
}

// Отсортировать карты по рангу убыванию
function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
}

// Выбрать `count` карт указанного ранга
function pickRankCards(cards: Card[], rankValue: number, count: number): Card[] {
  return cards.filter(c => RANK_ORDER[c.rank] === rankValue).slice(0, count);
}

// Выбрать топ-`count` кикеров, исключая указанные ранги
function pickKickers(cards: Card[], excludeRanks: number[], count: number): Card[] {
  return sortByRankDesc(cards.filter(c => !excludeRanks.includes(RANK_ORDER[c.rank]))).slice(0, count);
}

// 5 высших карт одной масти (если флеш есть)
function pickFlushCards(cards: Card[]): Card[] {
  const bySuit: Record<string, Card[]> = {};
  for (const c of cards) {
    (bySuit[c.suit] ||= []).push(c);
  }
  for (const suit of Object.keys(bySuit)) {
    if (bySuit[suit].length >= 5) {
      return sortByRankDesc(bySuit[suit]).slice(0, 5);
    }
  }
  return [];
}

// 5 карт подряд (с поддержкой младшего «колесо»-стрита: NLH A-2-3-4-5, Шорт-дэк A-6-7-8-9)
function pickStraightCards(cards: Card[], format: GameFormat = 'nlh'): Card[] {
  // Один представитель для каждого ранга (карты могут повторяться по рангу с разными мастями)
  const byRank: Record<number, Card> = {};
  for (const c of cards) {
    const v = RANK_ORDER[c.rank];
    if (!byRank[v]) byRank[v] = c;
  }
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => b - a);
  for (let i = 0; i <= ranks.length - 5; i++) {
    if (ranks[i] - ranks[i + 4] === 4) {
      return ranks.slice(i, i + 5).map(v => byRank[v]);
    }
  }
  // Колесо (туз снизу): A + 4 младших ранга колоды по формату; высшая карта — старший из младших.
  const low = wheelLowRanks(format);
  if (ranks.includes(14) && low.every(v => ranks.includes(v))) {
    return [byRank[low[3]], byRank[low[2]], byRank[low[1]], byRank[low[0]], byRank[14]];
  }
  return [];
}

// Стрит-флеш: ищем стрит внутри одной масти
function pickStraightFlushCards(cards: Card[], format: GameFormat = 'nlh'): Card[] {
  const bySuit: Record<string, Card[]> = {};
  for (const c of cards) {
    (bySuit[c.suit] ||= []).push(c);
  }
  for (const suit of Object.keys(bySuit)) {
    if (bySuit[suit].length >= 5) {
      const straight = pickStraightCards(bySuit[suit], format);
      if (straight.length === 5) return straight;
    }
  }
  return [];
}

// Получить все 7 карт (2 руки + 5 общих)
function getAllCards(hand: Card[], community: Card[]): Card[] {
  return [...hand, ...community];
}

// Подсчёт одинаковых рангов
function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const val = RANK_ORDER[card.rank];
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return counts;
}

// Проверка на стрит
function isStraight(values: number[], format: GameFormat = 'nlh'): boolean {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length < 5) return false;

  // Обычный стрит
  for (let i = 0; i <= sorted.length - 5; i++) {
    if (sorted[i + 4] - sorted[i] === 4) return true;
  }

  // Колесо: туз снизу. NLH → A как 1 (A-2-3-4-5); Шорт-дэк → A как 5 (A-6-7-8-9).
  if (sorted.includes(14)) {
    const lowAceVal = format === 'shortdeck' ? 5 : 1;
    const lowAce = [lowAceVal, ...sorted.filter(v => v !== 14)].sort((a, b) => a - b);
    for (let i = 0; i <= lowAce.length - 5; i++) {
      if (lowAce[i + 4] - lowAce[i] === 4) return true;
    }
  }

  return false;
}

// Проверка на флеш
function isFlush(cards: Card[]): boolean {
  const suits = new Map<string, number>();
  for (const card of cards) {
    suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
  }
  return Array.from(suits.values()).some(count => count >= 5);
}

// Определить комбинацию
export function evaluateHand(hand: Card[], community: Card[], format: GameFormat = 'nlh'): HandResult {
  const vals = handValues(format);
  const allCards = getAllCards(hand, community);
  const values = allCards.map(c => RANK_ORDER[c.rank]).sort((a, b) => b - a);
  const rankCounts = countRanks(allCards);

  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);
  const pairs = counts.filter(c => c === 2).length;
  const hasThree = counts.includes(3);
  const hasFour = counts.includes(4);
  const hasStraight = isStraight(values, format);
  const hasFlush = isFlush(allCards);

  // Royal Flush / Straight Flush
  if (hasStraight && hasFlush) {
    const sfCards = pickStraightFlushCards(allCards, format);
    if (sfCards.length === 5) {
      // 10-J-Q-K-A одной масти — роял-флеш
      const ranksSet = new Set(sfCards.map(c => RANK_ORDER[c.rank]));
      if ([10, 11, 12, 13, 14].every(v => ranksSet.has(v))) {
        return { rank: 'royal-flush', value: vals['royal-flush'], highCards: [14], cards: sfCards };
      }
      // Старшая карта стрит-флеша = sfCards[0] (pickStraightCards возвращает массив с
      // высшей первой; для wheel A-2-3-4-5 — это пятёрка, не туз).
      const highCard = RANK_ORDER[sfCards[0].rank];
      return { rank: 'straight-flush', value: vals['straight-flush'], highCards: [highCard], cards: sfCards };
    }
  }

  // Four of a Kind
  if (hasFour) {
    const fourRank = Array.from(rankCounts.entries()).find(([, c]) => c === 4)![0];
    const fourCards = pickRankCards(allCards, fourRank, 4);
    const kicker = pickKickers(allCards, [fourRank], 1);
    return {
      rank: 'four-of-a-kind',
      value: vals['four-of-a-kind'],
      highCards: [fourRank, RANK_ORDER[kicker[0].rank]],
      cards: [...fourCards, ...kicker],
    };
  }

  // Full House. Покрываем два случая:
  //  (a) trips + pair (стандарт),
  //  (b) trips + trips — вторая тройка играет как пара (например AAA+KKK на 7 картах).
  const tripsCount = counts.filter(c => c === 3).length;
  const isFull = hasThree && (pairs >= 1 || tripsCount >= 2);
  const fullHouseResult = (): HandResult => {
    const tripRanks = Array.from(rankCounts.entries())
      .filter(([, c]) => c === 3)
      .map(([r]) => r)
      .sort((a, b) => b - a);
    const threeRank = tripRanks[0];
    // Кандидаты на пару: вторая тройка (если есть) и/или обычные пары.
    const pairCandidates: number[] = [];
    if (tripRanks.length >= 2) pairCandidates.push(tripRanks[1]);
    Array.from(rankCounts.entries())
      .filter(([r, c]) => c === 2 && r !== threeRank)
      .forEach(([r]) => pairCandidates.push(r));
    const pairRank = pairCandidates.sort((a, b) => b - a)[0];
    const threeCards = pickRankCards(allCards, threeRank, 3);
    const pairCards = pickRankCards(allCards, pairRank, 2);
    return {
      rank: 'full-house',
      value: vals['full-house'],
      highCards: [threeRank, pairRank],
      cards: [...threeCards, ...pairCards],
    };
  };
  const flushResult = (): HandResult => {
    const flushCards = pickFlushCards(allCards);
    return {
      rank: 'flush',
      value: vals['flush'],
      highCards: flushCards.map(c => RANK_ORDER[c.rank]),
      cards: flushCards,
    };
  };
  // Шорт-дэк: флеш бьёт фулл-хаус — при наличии обоих возвращаем флеш раньше. NLH — наоборот.
  if (format === 'shortdeck') {
    if (hasFlush) return flushResult();
    if (isFull) return fullHouseResult();
  } else {
    if (isFull) return fullHouseResult();
    if (hasFlush) return flushResult();
  }

  // Straight
  if (hasStraight) {
    const straightCards = pickStraightCards(allCards, format);
    return {
      rank: 'straight',
      value: vals['straight'],
      highCards: [RANK_ORDER[straightCards[0].rank]],
      cards: straightCards,
    };
  }

  // Three of a Kind
  if (hasThree) {
    const threeRank = Array.from(rankCounts.entries()).find(([, c]) => c === 3)![0];
    const threeCards = pickRankCards(allCards, threeRank, 3);
    const kickers = pickKickers(allCards, [threeRank], 2);
    return {
      rank: 'three-of-a-kind',
      value: vals['three-of-a-kind'],
      highCards: [threeRank, ...kickers.map(c => RANK_ORDER[c.rank])],
      cards: [...threeCards, ...kickers],
    };
  }

  // Two Pair
  if (pairs >= 2) {
    const pairRanks = Array.from(rankCounts.entries())
      .filter(([, c]) => c === 2)
      .map(([r]) => r)
      .sort((a, b) => b - a)
      .slice(0, 2);
    const pair1Cards = pickRankCards(allCards, pairRanks[0], 2);
    const pair2Cards = pickRankCards(allCards, pairRanks[1], 2);
    const kicker = pickKickers(allCards, pairRanks, 1);
    return {
      rank: 'two-pair',
      value: vals['two-pair'],
      highCards: [...pairRanks, RANK_ORDER[kicker[0].rank]],
      cards: [...pair1Cards, ...pair2Cards, ...kicker],
    };
  }

  // One Pair
  if (pairs === 1) {
    const pairRank = Array.from(rankCounts.entries()).find(([, c]) => c === 2)![0];
    const pairCards = pickRankCards(allCards, pairRank, 2);
    const kickers = pickKickers(allCards, [pairRank], 3);
    return {
      rank: 'pair',
      value: vals['pair'],
      highCards: [pairRank, ...kickers.map(c => RANK_ORDER[c.rank])],
      cards: [...pairCards, ...kickers],
    };
  }

  // High Card
  const highCards = sortByRankDesc(allCards).slice(0, 5);
  return {
    rank: 'high-card',
    value: vals['high-card'],
    highCards: highCards.map(c => RANK_ORDER[c.rank]),
    cards: highCards,
  };
}

// Русское читаемое название комбинации (с уточнением по старшим картам)
export function formatHandName(result: HandResult): string {
  const plural: Record<number, string> = {
    2: 'двоек', 3: 'троек', 4: 'четвёрок', 5: 'пятёрок', 6: 'шестёрок', 7: 'семёрок',
    8: 'восьмёрок', 9: 'девяток', 10: 'десяток', 11: 'валетов', 12: 'дам', 13: 'королей', 14: 'тузов',
  };
  const single: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'валета', 12: 'дамы', 13: 'короля', 14: 'туза',
  };
  const hc = result.highCards;
  switch (result.rank) {
    case 'royal-flush': return 'Роял-флеш';
    case 'straight-flush': return 'Стрит-флеш до ' + single[hc[0]];
    case 'four-of-a-kind': return 'Каре ' + plural[hc[0]];
    case 'full-house': return 'Фулл-хаус: ' + plural[hc[0]] + ' и ' + plural[hc[1]];
    case 'flush': return 'Флеш до ' + single[hc[0]];
    case 'straight': return 'Стрит до ' + single[hc[0]];
    case 'three-of-a-kind': return 'Сет ' + plural[hc[0]];
    case 'two-pair': return 'Две пары: ' + plural[hc[0]] + ' и ' + plural[hc[1]];
    case 'pair': return 'Пара ' + plural[hc[0]];
    case 'high-card': return 'Старшая карта: ' + single[hc[0]];
  }
}

// Сравнить две руки — вернуть >0 если hand1 лучше, <0 если hand2 лучше, 0 если ничья
export function compareHands(result1: HandResult, result2: HandResult): number {
  if (result1.value !== result2.value) {
    return result1.value - result2.value;
  }
  
  // Одинаковая комбинация — сравниваем по кикерам
  for (let i = 0; i < Math.min(result1.highCards.length, result2.highCards.length); i++) {
    if (result1.highCards[i] !== result2.highCards[i]) {
      return result1.highCards[i] - result2.highCards[i];
    }
  }
  
  return 0; // Ничья
}

// Определить победителя среди нескольких игроков
export function determineWinner(
  players: { id: string; hand: Card[]; folded: boolean }[],
  community: Card[],
  format: GameFormat = 'nlh'
): string[] {
  const activePlayers = players.filter(p => !p.folded);

  // Нет активных игроков (все folded / все отвалились) — победителей нет
  if (activePlayers.length === 0) {
    return [];
  }

  if (activePlayers.length === 1) {
    return [activePlayers[0].id];
  }

  const results = activePlayers.map(p => ({
    id: p.id,
    result: evaluateHand(p.hand, community, format),
  }));
  
  results.sort((a, b) => compareHands(b.result, a.result));
  
  const bestResult = results[0].result;
  const winners = results
    .filter(r => compareHands(r.result, bestResult) === 0)
    .map(r => r.id);
  
  return winners;
}
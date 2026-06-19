// Bad Beat Jackpot — детект квалифицирующей раздачи и расчёт выплаты (Вариант А). Чистые функции.
// Источник правды по правилам — POKER_RULES.md. Условия (полные): рука проигравшего ≥ порога-триггера,
// и победитель, и проигравший используют ОБЕ карманные карты, для каре нужна карманная пара,
// ≥4 игрока сдали префлоп. Выплата: % от пула (тир по блайндам), остаток переносится.
import { evaluateHand, compareHands } from './hands.js';
import type { Card, Rank, GameFormat } from './types.js';
import type { BadBeatTier } from './badBeatService.js';

interface HandResultLike {
  rank: string;
  highCards: number[];
  cards: Card[];
}

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
function cardsFromRanks(ranks: Rank[]): Card[] {
  // Масти по кругу — чтобы из threshold-комбинации не сложился случайный флеш.
  return ranks.map((rank, i) => ({ rank, suit: SUITS[i % 4] }));
}

// Пресет триггера → 5 карт минимальной квалифицирующей комбинации.
// Фулл-хаусы — точные ранги. Каре — с минимально возможным кикером, чтобы любое каре этого ранга
// проходило по compareHands (кикер не должен «отсекать» валидные каре).
const TRIGGER_RANKS: Record<string, Rank[]> = {
  aaa22: ['A', 'A', 'A', '2', '2'],
  aaa88: ['A', 'A', 'A', '8', '8'],
  aaajj: ['A', 'A', 'A', 'J', 'J'],
  aaakk: ['A', 'A', 'A', 'K', 'K'],
  '2222': ['2', '2', '2', '2', '3'],
  '6666': ['6', '6', '6', '6', '2'],
  // Short Deck
  '9999': ['9', '9', '9', '9', '2'],
  tttt: ['10', '10', '10', '10', '2'],
  jjjj: ['J', 'J', 'J', 'J', '2'],
  qqqq: ['Q', 'Q', 'Q', 'Q', '2'],
  kkkk: ['K', 'K', 'K', 'K', '2'],
  aaaa: ['A', 'A', 'A', 'A', '2'],
};

// Обе карманные карты входят в 5 карт комбинации.
function usesBothHole(hole: Card[], combo: Card[]): boolean {
  if (hole.length < 2) return false;
  return hole.every((h) => combo.some((c) => c.rank === h.rank && c.suit === h.suit));
}

// Для каре нужна карманная пара того же ранга (две одинаковые карманные = ранг каре).
function quadsPocketPair(hole: Card[], r: HandResultLike): boolean {
  if (hole.length < 2 || hole[0].rank !== hole[1].rank) return false;
  return r.cards.filter((c) => c.rank === hole[0].rank).length === 4;
}

export interface Contender {
  id: string;
  hole: Card[];
}
export interface BadBeatDetectResult {
  loserId: string; // «бэд-бит победитель» — проиграл монстр-рукой
  opponentId: string; // «бэд-бит противник» — забрал банк
}

// Детект бэд-бита среди дошедших до showdown. Возвращает null, если не сорван.
export function detectBadBeat(params: {
  contenders: Contender[];
  community: Card[];
  winnerIds: string[];
  presetId: string;
  dealtCount: number;
  format?: GameFormat;
}): BadBeatDetectResult | null {
  const { contenders, community, winnerIds, presetId, dealtCount, format = 'nlh' } = params;
  if (dealtCount < 4) return null;
  const ranks = TRIGGER_RANKS[presetId];
  if (!ranks) return null;
  const threshold = evaluateHand(cardsFromRanks(ranks), [], format);
  const winnerSet = new Set(winnerIds);

  // Победитель банка должен использовать обе карманные.
  const winner = contenders.find((c) => winnerSet.has(c.id));
  if (!winner) return null;
  const winnerEval = evaluateHand(winner.hole, community, format);
  if (!usesBothHole(winner.hole, winnerEval.cards)) return null;

  // Сильнейший проигравший, чья рука ≥ порога и удовлетворяет условиям.
  let best: { id: string; result: ReturnType<typeof evaluateHand> } | null = null;
  for (const c of contenders) {
    if (winnerSet.has(c.id)) continue;
    const r = evaluateHand(c.hole, community, format);
    if (compareHands(r, threshold) < 0) continue;
    if (!usesBothHole(c.hole, r.cards)) continue;
    if (r.rank === 'four-of-a-kind' && !quadsPocketPair(c.hole, r)) continue;
    if (!best || compareHands(r, best.result) > 0) best = { id: c.id, result: r };
  }
  if (!best) return null;
  return { loserId: best.id, opponentId: winner.id };
}

export interface BadBeatPayout {
  payouts: { id: string; amount: number }[];
  total: number;
}

// Выплата (Вариант А): % от пула победителю-бэд-бита / противнику / остальным (каждому).
// Если сумма долей превышает пул (много игроков, высокие %) — масштабируем вниз пропорционально.
export function computeBadBeatPayout(params: {
  pool: number;
  tier: BadBeatTier;
  loserId: string;
  opponentId: string;
  otherIds: string[];
}): BadBeatPayout {
  const { pool, tier, loserId, opponentId, otherIds } = params;
  if (pool <= 0) return { payouts: [], total: 0 };
  const raw = [
    { id: loserId, amount: Math.floor((pool * tier.win) / 100) },
    { id: opponentId, amount: Math.floor((pool * tier.opp) / 100) },
    ...otherIds.map((id) => ({ id, amount: Math.floor((pool * tier.oth) / 100) })),
  ];
  const total = raw.reduce((s, p) => s + p.amount, 0);
  let scaled = raw;
  if (total > pool && total > 0) {
    const factor = pool / total;
    scaled = raw.map((p) => ({ id: p.id, amount: Math.floor(p.amount * factor) }));
  }
  const payouts = scaled.filter((p) => p.amount > 0);
  return { payouts, total: payouts.reduce((s, p) => s + p.amount, 0) };
}

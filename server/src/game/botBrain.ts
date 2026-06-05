// Бот-мозг: принимает решения за ботом за столом.
// Все типы продублированы локально из shared (см. CLAUDE.md 4, rootDir ограничение).
// Вызывается из BotManager.scheduleBotDecision().

import { evaluateHand, compareHands } from './hands.js';
import { type Card, type Rank, type GamePhase } from './types.js';

// ===== Бот-специфичные дубли типов (из shared) =====
type BotPnLTarget = 'zero' | 'plus' | 'minus';
type BotPeekMode = 'river' | 'turn' | 'full';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export interface BotPersona {
  aggression: number;
  bluffRate: number;
  heroFoldRate: number;
  slowplayRate: number;
  vpip: number;
  reactionFast: [number, number];
  reactionSlow: [number, number];
  fastBias: number;
}

// Runtime-метрики бота (живут в памяти BotManager, не персистятся между рестартами).
// Используются для PnL-балансировки, антифрод-метрик, cool-off после крупных банков.
export interface BotRuntime {
  realizedPnL: number;          // Δchips накопительно с момента включения режима
  expectedPnL: number;          // Σ EV принятых решений (для сравнения с realized)
  handsPlayed: number;
  handStartChips: number;       // chips на начало текущей раздачи (для Δ)
  recentActions: Array<{ phase: GamePhase; action: string; strength: number; tag?: string }>;
  // Sliding window ring buffer: handsIdx, на которых случилось событие.
  // Считаем «было ли событие за последние 50 рук» через фильтр `handIdx > handsPlayed - 50`.
  // Раньше был простой счётчик с reset через `%50` — давал «всплеск» раз в 50 рук, а не скольжение.
  bluffEventHands: number[];        // handsPlayed-индексы, на которых бот блефовал
  bluffCallEventHands: number[];    // handsPlayed-индексы, на которых ловил блеф (call с marginal)
  lastBigPnLAt: number;         // timestamp последнего крупного выигрыша/проигрыша (cool-off)
}

export interface BotDecisionContext {
  // Карты и состояние бота
  myCards: Card[];
  myCurrentBet: number;
  myChips: number;

  // Стол
  board: Card[];
  pot: number;
  currentBet: number;
  phase: GamePhase;
  bigBlind: number;

  // Оппоненты: cards содержат реальные карты (с сервера) — botBrain сам решит использовать или нет
  activeOpponents: Array<{
    id: string;
    cards: Card[];
    chips: number;
    currentBet: number;
    isFolded: boolean;
    isBot: boolean;
  }>;

  // Будущий борд (без burn-карт) — для peek-mode выше 'river'
  futureBoard: Card[];

  // Бот
  persona: BotPersona;
  targetPnL: BotPnLTarget;
  runtime: BotRuntime;
  peekMode: BotPeekMode;

  // Детерминированный RNG (seed = botId + handIndex) — воспроизводимо для дебага
  rng: () => number;
}

export interface BotDecision {
  action: 'fold' | 'check' | 'call' | 'raise' | 'all-in';
  amount?: number;
  delayMs: number;
  tag?: string;       // 'normal' | 'bluff' | 'hero-fold' | 'slowplay' | 'value' | ...
  // События для runtime-метрик — decideAction чистая, запись делает BotManager (ROADMAP §9.3-D).
  recordBluff?: boolean;      // бот блефанул (для bluffEventHands)
  recordBluffCall?: boolean;  // бот call'нул на bluff-catch boost (для bluffCallEventHands)
}

// ===== Утилиты =====

// Seeded RNG (mulberry32) — детерминируемый, не глобальный
export function makeSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash строки в uint32 (для seed-генерации)
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Округление "по-человечески": к четверти/половине/целому BB.
function roundHumanly(amount: number, bb: number, rng: () => number): number {
  // 60% — кратно 1 BB, 30% — кратно 0.5 BB, 10% — кратно 0.25 BB
  const r = rng();
  let step = bb;
  if (r < 0.10) step = Math.max(1, Math.floor(bb / 4));
  else if (r < 0.40) step = Math.max(1, Math.floor(bb / 2));
  return Math.max(step, Math.round(amount / step) * step);
}

// ===== Hand strength: pre-flop без peek =====
export function preflopStrength(cards: Card[]): number {
  if (cards.length !== 2) return 0;
  const ranks = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suited = cards[0].suit === cards[1].suit;
  const r1 = ranks[0];
  const r2 = ranks[1];
  const pair = r1 === r2;

  if (pair) {
    if (r1 >= 13) return 0.96; // KK+
    if (r1 >= 12) return 0.90; // QQ
    if (r1 >= 11) return 0.82; // JJ
    if (r1 >= 9) return 0.68;  // 99-TT
    if (r1 >= 6) return 0.50;  // 66-88
    return 0.36;               // 22-55
  }

  let s = 0.0;
  s += (r1 - 2) / 12 * 0.50;
  s += (r2 - 2) / 12 * 0.22;
  const gap = r1 - r2;
  if (gap === 1) s += 0.10;
  else if (gap === 2) s += 0.05;
  else if (gap <= 4) s += 0.02;
  if (suited) s += 0.08;
  if (r2 >= 10) s += 0.06; // обе broadways
  if (r1 === 14 && r2 >= 10) s += 0.04; // AK/AQ/AJ/AT
  return Math.min(0.85, s);
}

// ===== Hand strength: post-flop без peek =====
export function postflopStrength(cards: Card[], board: Card[]): number {
  if (board.length < 3) return preflopStrength(cards);
  const h = evaluateHand(cards, board);
  const boardRanks = board.map((c) => RANK_VALUE[c.rank]);
  const maxBoard = Math.max(...boardRanks);

  switch (h.rank) {
    case 'high-card':
      return 0.10;
    case 'pair': {
      const pairValue = h.highCards[0];
      // Overpair (выше всех на борде)
      if (pairValue > maxBoard) return 0.62;
      // Top pair
      if (pairValue === maxBoard) {
        const kicker = h.highCards[1] ?? 0;
        if (kicker >= 13) return 0.58;       // top pair + K/A kicker
        if (kicker >= 11) return 0.50;
        return 0.42;
      }
      // Middle/bottom pair
      return 0.28;
    }
    case 'two-pair':
      return 0.70;
    case 'three-of-a-kind':
      return 0.80;
    case 'straight':
      return 0.86;
    case 'flush':
      return 0.90;
    case 'full-house':
      return 0.95;
    case 'four-of-a-kind':
    case 'straight-flush':
    case 'royal-flush':
      return 0.99;
    default:
      return 0.15;
  }
}

// ===== Peek-based strength: знаем чужие карты + future board =====
// Симулируем showdown на полном борде, возвращаем 0.05/0.50/0.98 (loss/tie/win).
export function peekStrength(
  myCards: Card[],
  fullBoard: Card[],
  opponents: Array<{ cards: Card[]; isFolded: boolean }>,
): { strength: number; willWin: boolean; willTie: boolean } {
  const active = opponents.filter((o) => !o.isFolded && o.cards.length === 2);
  if (active.length === 0) return { strength: 0.98, willWin: true, willTie: false };

  const myEval = evaluateHand(myCards, fullBoard);
  let bestOpp = evaluateHand(active[0].cards, fullBoard);
  for (let i = 1; i < active.length; i++) {
    const e = evaluateHand(active[i].cards, fullBoard);
    if (compareHands(e, bestOpp) > 0) bestOpp = e;
  }
  const cmp = compareHands(myEval, bestOpp);
  if (cmp > 0) return { strength: 0.98, willWin: true, willTie: false };
  if (cmp < 0) return { strength: 0.05, willWin: false, willTie: false };
  return { strength: 0.50, willWin: false, willTie: true };
}

// Определить, доступен ли peek на текущей фазе
function peekAvailable(peekMode: BotPeekMode, phase: GamePhase): boolean {
  if (peekMode === 'full') return true;
  if (peekMode === 'turn' && (phase === 'turn' || phase === 'river')) return true;
  if (peekMode === 'river' && phase === 'river') return true;
  return false;
}

// ===== PnL drift: насколько бот «отклонился» от своего target =====
// Возвращает riskShift в [-0.25, +0.25]: положительный = "играть сильнее",
// отрицательный = "играть слабее" (склонность слить).
export function computeRiskShift(
  realizedPnL: number,
  target: BotPnLTarget,
  handsPlayed: number,
  bigBlind: number,
): number {
  const windowHands = Math.max(30, handsPlayed);
  let targetChips = 0;
  if (target === 'plus') targetChips = 0.2 * bigBlind * windowHands;
  if (target === 'minus') targetChips = -0.3 * bigBlind * windowHands;
  const drift = realizedPnL - targetChips;
  // Нормализуем к 10*BB как «единица»
  const norm = drift / (10 * bigBlind);
  // Drift > 0 (выше плана) → отрицательный shift → играть слабее
  // Drift < 0 (ниже плана) → положительный shift → играть сильнее
  const shift = -norm * 0.12;
  return Math.max(-0.25, Math.min(0.25, shift));
}

// ===== PnL Zone — для balance-driven peek decisions =====
// Возвращает «зону» относительно цели + сколько бот может позволить себе проиграть/выиграть сейчас.
// Используется при peek=full (бот знает исход showdown) — вместо жёсткого fold-at-loss бот принимает
// решение исходя из своей текущей позиции относительно target PnL.
//
// Логика human-likeness:
// - over (далеко в плюсе от target) → может позволить проиграть много (играет «фишево»), не пушит выигрыши.
// - neutral → стандартный покер.
// - under (отстаёт от target) → пробивает каждый known-win, фолдит дешёвые known-loss.
export interface PnLZoneInfo {
  zone: 'over' | 'neutral' | 'under';
  driftBB: number;
  allowedLossNow: number;  // в chips — сколько готовы вложить в known-loss раздачу
  needWinPressure: number; // 0..1 — насколько агрессивно push'ить known-win
}

export function computePnLZone(
  realizedPnL: number,
  target: BotPnLTarget,
  handsPlayed: number,
  bigBlind: number,
): PnLZoneInfo {
  // Ожидаемый PnL при заданной цели
  const targetPerHand = target === 'plus' ? 0.2 : target === 'minus' ? -0.2 : 0;
  const expected = handsPlayed * targetPerHand * bigBlind;
  const drift = realizedPnL - expected;
  const driftBB = drift / bigBlind;

  // Tolerance zone ±5 BB
  let zone: PnLZoneInfo['zone'];
  if (driftBB > 5) zone = 'over';
  else if (driftBB < -5) zone = 'under';
  else zone = 'neutral';

  // allowedLossNow: сколько fish-стиля позволено сейчас (chips)
  // over   → 12 BB (хорошо в плюсе, можем «лиrнуть»)
  // neutral → 4 BB (умеренно)
  // under  → 1 BB (бережём стек)
  const allowedLossBB = zone === 'over' ? 12 : zone === 'neutral' ? 4 : 1;
  const allowedLossNow = allowedLossBB * bigBlind;

  // needWinPressure: насколько push'ить known-win
  // under  → 1.0 (агрессивно)
  // neutral → 0.6
  // over   → 0.2 (не пуш, slowplay)
  const needWinPressure = zone === 'under' ? 1.0 : zone === 'neutral' ? 0.6 : 0.2;

  return { zone, driftBB, allowedLossNow, needWinPressure };
}

// ===== Bi-modal reaction time =====
export function pickReactionTimeMs(persona: BotPersona, rng: () => number): number {
  const useFast = rng() < persona.fastBias;
  const [lo, hi] = useFast ? persona.reactionFast : persona.reactionSlow;
  return Math.round(lo + rng() * (hi - lo));
}

// ===== Пайплайн принятия решения =====
// decideAction разложен на правила-функции (ROADMAP §9.3-D). Каждое правило получает общий
// мутабельный DecisionState и возвращает BotDecision (терминально) либо null (передать дальше).
// КРИТИЧНО: порядок rng-вызовов идентичен прежней монолитной версии (golden-тесты это
// фиксируют, см. botBrain.test.ts) — короткие замыкания в условиях сохранены дословно.

// Общее состояние решения: входной ctx + предвычисленные значения.
interface DecisionState {
  ctx: BotDecisionContext;
  toCall: number;
  canCheck: boolean;
  strength: number;
  knownWinIfShowdown: boolean;
  knownLossIfShowdown: boolean;
  foldThreshold: number;
  callThreshold: number;
  raiseThreshold: number;
  bluffCatchBoost: number;   // выставляется в applyVarianceAndBoost
  effective: number;         // strength + noise + bluffCatchBoost (после applyVarianceAndBoost)
}

// Базовые пороги (зависят от фазы). Пересмотрены 2026-05-18 (см. CLAUDE.md §11.32).
// Старые значения (preflop call=0.62 raise=0.85) давали 91% uncontested + 130 preflop raises
// на 174 раздачи — raiseThreshold фактически не использовался, всё ≥0.62 уходило в raise.
// Новые значения расширяют диапазон call (между fold и raise) → реальный VPIP-PFR gap.
const BASE_BY_PHASE: Record<GamePhase, { fold: number; call: number; raise: number }> = {
  waiting:  { fold: 0.25, call: 0.45, raise: 0.65 },
  preflop:  { fold: 0.30, call: 0.52, raise: 0.72 },
  flop:     { fold: 0.30, call: 0.50, raise: 0.72 },
  turn:     { fold: 0.32, call: 0.55, raise: 0.76 },
  river:    { fold: 0.35, call: 0.60, raise: 0.82 },
  showdown: { fold: 0.30, call: 0.55, raise: 0.75 },
};

// Шаги 1-3: оценка силы руки, PnL drift → riskShift, базовые пороги под persona.
function initDecisionState(ctx: BotDecisionContext): DecisionState {
  const {
    myCards, myCurrentBet, board, currentBet, phase, bigBlind,
    activeOpponents, futureBoard, persona, targetPnL, runtime, peekMode,
  } = ctx;

  const toCall = Math.max(0, currentBet - myCurrentBet);
  const canCheck = toCall === 0;

  // Шаг 1: сила руки
  let strength: number;
  let knownWinIfShowdown = false;
  let knownLossIfShowdown = false;
  if (peekAvailable(peekMode, phase)) {
    // Полный пик: знаем итог, если дойдём до showdown
    const fullBoard = [...board, ...futureBoard];
    const peek = peekStrength(myCards, fullBoard, activeOpponents);
    strength = peek.strength;
    knownWinIfShowdown = peek.willWin;
    knownLossIfShowdown = !peek.willWin && !peek.willTie;
  } else {
    // Без peek — классическая эвристика
    strength = phase === 'preflop' ? preflopStrength(myCards) : postflopStrength(myCards, board);
  }

  // Шаг 2: PnL drift → riskShift
  const riskShift = computeRiskShift(runtime.realizedPnL, targetPnL, runtime.handsPlayed, bigBlind);

  // Шаг 3: базовые пороги, скорректированные на persona.
  // persona.aggression смещает callThreshold (агрессивные чаще call'ят 3-bet) и raiseThreshold
  // (агрессивные чаще raise instead of call). persona.vpip смещает foldThreshold (loose играют больше).
  const base = BASE_BY_PHASE[phase];
  const aggrShift = (persona.aggression - 0.5) * 0.15;
  const vpipShift = (0.5 - persona.vpip) * 0.10; // высокий vpip → отрицательный shift → меньше fold

  return {
    ctx,
    toCall,
    canCheck,
    strength,
    knownWinIfShowdown,
    knownLossIfShowdown,
    foldThreshold: base.fold + riskShift + vpipShift,
    callThreshold: base.call + riskShift - aggrShift * 0.5,
    raiseThreshold: base.raise + riskShift - aggrShift,
    bluffCatchBoost: 0,
    effective: strength,
  };
}

// ===== Шаг 4: Анти-фрод инъекции (НЕЗАВИСИМЫЕ от drift, чтобы не палиться) =====

// (а) Bluff: слабая рука + случайно агрессивно. Не зависит от drift.
//     Полезен с peek = знаем что проиграем → но иногда блефуем, выглядит человечно.
function ruleBluff(s: DecisionState): BotDecision | null {
  const { persona, currentBet, pot, bigBlind, myChips, myCurrentBet, activeOpponents, rng } = s.ctx;
  if (s.strength < 0.32 && rng() < persona.bluffRate && !s.knownWinIfShowdown) {
    // Bluff не имеет смысла если оппоненты не зафолдят (heads-up vs station — попадаются).
    // Простая эвристика: блеф только если ≤ 2 активных оппонентов.
    const activeCount = activeOpponents.filter((o) => !o.isFolded).length;
    if (activeCount <= 2) {
      const size = computeRaiseSize(
        currentBet, pot, bigBlind, myChips, myCurrentBet, 0.4, rng,
      );
      if (size >= currentBet * 2 && size <= myChips + myCurrentBet) {
        // Запись bluff-события — в BotManager (decideAction чистая, §9.3-D).
        return { action: 'raise', amount: size, delayMs: pickReactionTimeMs(persona, rng), tag: 'bluff', recordBluff: true };
      }
    }
  }
  return null;
}

// (б) Hero-fold: сильная рука + большой call. Иногда фолдим монстра.
// Guard: с known-win НЕ hero-fold'им — это знание победы, а не догадка о силе.
// Hero-fold имеет смысл для heuristic-strength (бот «чувствует» что соперник сильнее),
// но с peek=true бот ЗНАЕТ исход — fold здесь self-defeating.
function ruleHeroFold(s: DecisionState): BotDecision | null {
  const { persona, pot, rng } = s.ctx;
  if (s.strength > 0.82 && s.toCall > pot * 0.55 && !s.knownWinIfShowdown && rng() < persona.heroFoldRate) {
    return { action: s.canCheck ? 'check' : 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'hero-fold' };
  }
  return null;
}

// (в) Slowplay: монстр + сильный позитив → call вместо raise.
function ruleSlowplay(s: DecisionState): BotDecision | null {
  const { persona, rng } = s.ctx;
  if (s.strength > 0.90 && rng() < persona.slowplayRate) {
    if (s.canCheck) {
      return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'slowplay-check' };
    }
    return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'slowplay-call' };
  }
  return null;
}

// (г) Mistake injection: 3% решений — намеренно неоптимальные (для marginal hands).
//     С peek это критично: бот, который ВСЕГДА правильно играет, легко детектится.
//     Sunk-cost guard: НЕ mistake-fold'им с known-win (инвариант «не fold с гарантированным выигрышем»).
function ruleMistake(s: DecisionState): BotDecision | null {
  const { persona, rng } = s.ctx;
  if (rng() < 0.03 && s.strength > 0.40 && s.strength < 0.75 && !s.knownWinIfShowdown) {
    // Вместо нормального — слегка хуже
    if (rng() < 0.5 && !s.canCheck) {
      return { action: 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'mistake-fold' };
    }
    if (s.toCall > 0) {
      return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'mistake-call' };
    }
  }
  return null;
}

// ===== Шаг 4д + 5: bluff-catch quota + variance noise (±4%) =====
// (д) Bluff-catch quota: если за последние 50 рук бот ни разу не call'нул при подозрении на блеф
//     с marginal рукой — поднять шанс. Против паттерна «бот никогда не верит блефу».
//     Sliding window: фильтруем события за last 50 рук.
// (5) Variance noise: ±4% к силе руки. effective = strength + noise + bluffCatchBoost.
function applyVarianceAndBoost(s: DecisionState): void {
  const { runtime, rng } = s.ctx;
  const windowStart = runtime.handsPlayed - 50;
  const recentBluffCalls = runtime.bluffCallEventHands.filter((h) => h > windowStart).length;
  let bluffCatchBoost = 0;
  if (recentBluffCalls < 2 && runtime.handsPlayed > 30) {
    bluffCatchBoost = 0.08;
  }
  const noise = (rng() - 0.5) * 0.08;
  s.bluffCatchBoost = bluffCatchBoost;
  s.effective = s.strength + noise + bluffCatchBoost;
}

// ===== Шаг 5.5: SPR awareness — низкий стек-к-pot → бинарные решения =====
// SPR (stack-to-pot ratio). Низкий SPR = коммитнуты в банк → либо all-in (monster), либо fold.
function ruleSPR(s: DecisionState): BotDecision | null {
  const { persona, pot, phase, myChips, rng } = s.ctx;
  const sprAfterCall = pot + s.toCall > 0 ? (myChips - s.toCall) / (pot + s.toCall) : Infinity;
  if (phase !== 'preflop' && sprAfterCall < 2 && s.toCall > 0) {
    // С monster или знанием победы — all-in
    if (s.knownWinIfShowdown || s.effective > 0.80) {
      return { action: 'all-in', delayMs: pickReactionTimeMs(persona, rng), tag: 'spr-allin' };
    }
    // С marginal/слабой рукой — fold (нельзя call'ить, потом ещё больше потеряем).
    // Sunk-cost guard: только без known-win (fold с knownWin self-defeating).
    if (s.effective < 0.62 && !s.knownWinIfShowdown) {
      return { action: 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'spr-fold' };
    }
  }
  return null;
}

// ===== Шаг 5.6: Pot odds check — критично для не-всё-в-банк решений =====
// Если call -EV (моя equity меньше нужного на банк) — force fold, кроме редких mistake-call.
// НЕ применяется при peek-знании (knownWin/Loss) — там PnL-driven override (rulePeekPnL).
function rulePotOdds(s: DecisionState): BotDecision | null {
  const { persona, pot, rng } = s.ctx;
  if (s.toCall > 0 && !s.knownWinIfShowdown && !s.knownLossIfShowdown) {
    const potOdds = s.toCall / (pot + s.toCall);
    // Tolerance 5% — имитация неточной оценки человеком
    const needed = potOdds - 0.05;
    if (s.effective < needed) {
      // 5% случаев — всё равно call (mistake-call для незаметности и bluff-catch)
      if (rng() > 0.05) {
        return { action: 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'pot-odds-fold' };
      }
    }
  }
  return null;
}

// ===== Шаг 6: PnL-driven peek decision =====
// Когда peek даёт явный outcome (win/loss), бот решает исходя из PnL drift'а относительно target,
// а не из самой эквити: в плюсе может позволить себе проиграть (играет как «фиш»), в минусе —
// пробивает known-win агрессивно, в нуле — стандартно. 5% случаев игнорируем override (mistake).
// Может вернуть null (neutral zone / edge case) → падение в терминальную лестницу порогов.
function rulePeekPnL(s: DecisionState): BotDecision | null {
  const { persona, currentBet, pot, bigBlind, myChips, myCurrentBet, phase, peekMode, targetPnL, runtime, rng } = s.ctx;
  if (peekAvailable(peekMode, phase) && (s.knownWinIfShowdown || s.knownLossIfShowdown) && rng() > 0.05) {
    const pnl = computePnLZone(runtime.realizedPnL, targetPnL, runtime.handsPlayed, bigBlind);

    if (s.knownLossIfShowdown) {
      // Знаем что проиграем showdown.
      if (s.canCheck) {
        return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-loss-check-' + pnl.zone };
      }
      // Оценим ожидаемые потери до showdown: toCall now + продолжения на оставшихся улицах.
      const remainingStreets = phase === 'preflop' ? 3 : phase === 'flop' ? 2 : phase === 'turn' ? 1 : 0;
      const expectedTotalLoss = s.toCall + s.toCall * 1.5 * (remainingStreets / 3);

      if (expectedTotalLoss <= pnl.allowedLossNow) {
        // Можем себе позволить — call (играем как «фиш в плюсе»)
        return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-loss-call-' + pnl.zone };
      }
      // Не можем — fold (бережём стек)
      return { action: 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-loss-fold-' + pnl.zone };
    }

    if (s.knownWinIfShowdown) {
      // Знаем что выиграем showdown.
      if (pnl.zone === 'over') {
        // Не нужно ещё в плюс — slowplay (check/call вместо raise).
        // Но НИКОГДА не fold с known-win: fold = гарантированная потеря вложенного,
        // call = гарантированный выигрыш pot. Балансировка через "не raise" (см. CLAUDE.md §11.37).
        if (s.canCheck) {
          return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-slowplay-check' };
        }
        if (s.toCall <= pnl.allowedLossNow * 0.5) {
          return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-slowplay-call' };
        }
        // Большой call с known-win → 70% call (slowplay-bigcall), 30% all-in (перекрутить).
        // Раньше тут был peek-win-overfold (fold) — баг: бот терял весь pot вместо выигрыша.
        if (rng() < 0.30 && myChips > 0) {
          return { action: 'all-in', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-overshove' };
        }
        return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-slowplay-bigcall' };
      }
      if (pnl.zone === 'under') {
        // Нужно агрессивно зарабатывать — push выигрышных рук
        const aggressionFactor = 0.7 + persona.aggression * 0.2;
        const pushSize = computeRaiseSize(currentBet, pot, bigBlind, myChips, myCurrentBet, aggressionFactor, rng);
        const maxBet = myChips + myCurrentBet;
        if (pushSize >= maxBet * 0.85) {
          return { action: 'all-in', delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-push-allin' };
        }
        const minR = Math.max(currentBet * 2, currentBet + bigBlind);
        const finalSize = Math.max(minR, Math.min(pushSize, maxBet - 1));
        if (finalSize > currentBet) {
          return { action: 'raise', amount: finalSize, delayMs: pickReactionTimeMs(persona, rng), tag: 'peek-win-push' };
        }
      }
      // Neutral zone OR pushSize ушёл в edge case → fall through к нормальной threshold-логике
      // (effective ≈ 0.98 от peekStrength → попадёт в raise/value-raise естественно).
    }
  }
  return null;
}

// ===== Терминальная лестница порогов (fold/call/value/raise) =====
// Вызывается последней — ВСЕГДА возвращает решение.
function finalThresholdLadder(s: DecisionState): BotDecision {
  const { persona, currentBet, pot, bigBlind, myChips, myCurrentBet, phase, rng } = s.ctx;

  if (s.effective < s.foldThreshold) {
    if (s.canCheck) {
      return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'normal-check' };
    }
    return { action: 'fold', delayMs: pickReactionTimeMs(persona, rng), tag: 'normal-fold' };
  }

  if (s.effective < s.callThreshold) {
    if (s.canCheck) {
      return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'normal-check' };
    }
    // Если bluffCatchBoost дал call — пометить событие (запись в runtime — в BotManager, §9.3-D).
    return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'normal-call', recordBluffCall: s.bluffCatchBoost > 0 };
  }

  // Промежуточная зона между call и raise: обычно call (value-call), иногда small raise
  // (зависит от persona.aggression — агрессивные чаще делают small raise instead of flat call).
  // Это даёт реальный VPIP-PFR gap: с marginal-strong рукой (AJo, TT, suited broadways)
  // часть ботов call'ят (LAG-style), часть raise'ят (TAG-style).
  if (s.effective < s.raiseThreshold) {
    // Anti-escalation: на префлопе при facing 3-bet+ (currentBet > 4*BB) marginal руками не рейзим
    const isPreflopFacing3bet = phase === 'preflop' && currentBet > 4 * bigBlind;
    const wantSmallRaise = !isPreflopFacing3bet && rng() < persona.aggression * 0.4;

    if (wantSmallRaise) {
      // Small raise: 2.0-2.5x currentBet или pot-sized — что меньше
      const small = Math.min(currentBet * 2.5, currentBet + pot);
      const minR = Math.max(currentBet * 2, currentBet + bigBlind);
      const finalSize = Math.max(minR, Math.round(small));
      if (finalSize < myChips + myCurrentBet && finalSize > currentBet) {
        return {
          action: 'raise',
          amount: finalSize,
          delayMs: pickReactionTimeMs(persona, rng),
          tag: 'value-call-raise',
        };
      }
    }
    if (s.canCheck) {
      return { action: 'check', delayMs: pickReactionTimeMs(persona, rng), tag: 'value-check' };
    }
    return { action: 'call', delayMs: pickReactionTimeMs(persona, rng), tag: 'value-call' };
  }

  // Raise: размер зависит от силы
  const aggressionFactor = 0.4 + (s.effective - 0.5) * 0.8 + persona.aggression * 0.3;
  let size = computeRaiseSize(currentBet, pot, bigBlind, myChips, myCurrentBet, aggressionFactor, rng);

  // Cap raise size на префлопе — открытие 2.5-4x BB, 3-bet до 3x prev. Без monster/peek — не больше.
  // Предотвращает эскалацию рейзов до all-in за 2-3 раунда.
  if (phase === 'preflop' && !s.knownWinIfShowdown && s.effective < 0.90) {
    const maxPreflopRaise = Math.max(currentBet * 3, bigBlind * 4);
    if (size > maxPreflopRaise) size = maxPreflopRaise;
  }
  // На постфлопе — не больше pot (то есть pot-sized bet — потолок без monster)
  if (phase !== 'preflop' && !s.knownWinIfShowdown && s.effective < 0.85) {
    const maxPostflopRaise = currentBet + pot;
    if (size > maxPostflopRaise) size = maxPostflopRaise;
  }

  // All-in защита: если size >= chips, это all-in
  const maxBet = myChips + myCurrentBet;
  if (size >= maxBet) {
    return { action: 'all-in', delayMs: pickReactionTimeMs(persona, rng), tag: 'all-in' };
  }

  // Min-raise защита
  const minRaise = Math.max(currentBet * 2, currentBet + bigBlind);
  const finalSize = Math.max(minRaise, size);

  return {
    action: 'raise',
    amount: finalSize,
    delayMs: pickReactionTimeMs(persona, rng),
    tag: s.knownWinIfShowdown ? 'value-raise' : 'normal-raise',
  };
}

// Правила, работающие на сырой strength (до variance-шума).
const PRE_VARIANCE_RULES: Array<(s: DecisionState) => BotDecision | null> = [
  ruleBluff, ruleHeroFold, ruleSlowplay, ruleMistake,
];

// Правила, работающие на effective (после variance-шума).
const POST_VARIANCE_RULES: Array<(s: DecisionState) => BotDecision | null> = [
  ruleSPR, rulePotOdds, rulePeekPnL,
];

// ===== Главная функция: принять решение =====
// Оркестратор пайплайна. Порядок rng-вызовов идентичен прежней монолитной версии.
export function decideAction(ctx: BotDecisionContext): BotDecision {
  const s = initDecisionState(ctx);

  for (const rule of PRE_VARIANCE_RULES) {
    const d = rule(s);
    if (d) return d;
  }

  applyVarianceAndBoost(s);

  for (const rule of POST_VARIANCE_RULES) {
    const d = rule(s);
    if (d) return d;
  }

  return finalThresholdLadder(s);
}

// Расчёт размера raise с шумом и человечным округлением
export function computeRaiseSize(
  currentBet: number,
  pot: number,
  bigBlind: number,
  myChips: number,
  myCurrentBet: number,
  aggressionFactor: number,
  rng: () => number,
): number {
  // Base = pot * aggressionFactor + currentBet
  const noiseFactor = 0.85 + rng() * 0.30; // ±15%
  const base = currentBet + (pot + currentBet) * aggressionFactor * noiseFactor;
  const rounded = roundHumanly(base, bigBlind, rng);
  // Не превышаем стек
  const maxBet = myChips + myCurrentBet;
  return Math.min(rounded, maxBet);
}

// ===== Helper для BotManager: обновить runtime после раздачи =====
export function recordHandResult(runtime: BotRuntime, finalChips: number, bigBlind: number): void {
  const delta = finalChips - runtime.handStartChips;
  runtime.realizedPnL += delta;
  runtime.handsPlayed++;
  runtime.handStartChips = finalChips;
  // Cool-off отметка после крупного выигрыша/проигрыша
  if (Math.abs(delta) > bigBlind * 15) {
    runtime.lastBigPnLAt = Date.now();
  }
  // Ring buffer recent actions (обрезать до 20)
  if (runtime.recentActions.length > 20) {
    runtime.recentActions = runtime.recentActions.slice(-20);
  }
  // Sliding window 50 рук для bluff-метрик: фильтруем устаревшие события.
  // Без этого массивы росли бы бесконечно через всю сессию.
  const cutoff = runtime.handsPlayed - 50;
  runtime.bluffEventHands = runtime.bluffEventHands.filter((h) => h > cutoff);
  runtime.bluffCallEventHands = runtime.bluffCallEventHands.filter((h) => h > cutoff);
}

// Создать пустой runtime
export function createBotRuntime(initialChips: number): BotRuntime {
  return {
    realizedPnL: 0,
    expectedPnL: 0,
    handsPlayed: 0,
    handStartChips: initialChips,
    recentActions: [],
    bluffEventHands: [],
    bluffCallEventHands: [],
    lastBigPnLAt: 0,
  };
}

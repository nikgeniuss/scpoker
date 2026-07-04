import { describe, it, expect } from 'vitest';
import {
  makeSeededRng,
  hashStr,
  preflopStrength,
  postflopStrength,
  peekStrength,
  computeRiskShift,
  computePnLZone,
  computeRaiseSize,
  pickReactionTimeMs,
  recordHandResult,
  createBotRuntime,
  decideAction,
  type BotPersona,
  type BotDecisionContext,
} from '../botBrain.js';
import { cards } from './helpers/cards.js';

// Бот-мозг — чистые функции + seeded RNG (mulberry32). Эти тесты — ЗОЛОТАЯ ФИКСАЦИЯ
// текущего поведения ПЕРЕД распилом decideAction в пайплайн правил (ROADMAP §9.3-D).
// Чистые хелперы проверяются на инварианты; decideAction — characterization-тестами
// (детерминированный seed → точный BotDecision). Если распил меняет порядок rng-вызовов
// или логику — golden-тесты загорятся: это и есть страховочная сеть.

// ===== Детерминированный RNG =====

describe('makeSeededRng — детерминизм', () => {
  it('один seed → одинаковая последовательность', () => {
    const a = makeSeededRng(12345);
    const b = makeSeededRng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('разные seed → разные последовательности', () => {
    const a = makeSeededRng(1);
    const b = makeSeededRng(2);
    expect(a()).not.toEqual(b());
  });

  it('значения в [0, 1)', () => {
    const r = makeSeededRng(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashStr', () => {
  it('детерминирован и uint32', () => {
    const h1 = hashStr('bot:1|hand:5');
    const h2 = hashStr('bot:1|hand:5');
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h1)).toBe(true);
  });

  it('разные строки → разные хэши (как правило)', () => {
    expect(hashStr('a')).not.toBe(hashStr('b'));
  });
});

// ===== Pre-flop strength =====

describe('preflopStrength — порядок силы рук', () => {
  it('AA — самая сильная пара', () => {
    expect(preflopStrength(cards('As Ad'))).toBe(0.96);
  });

  it('пары по убыванию: KK >= QQ > JJ > TT > 88 > 55', () => {
    const kk = preflopStrength(cards('Ks Kd'));
    const qq = preflopStrength(cards('Qs Qd'));
    const jj = preflopStrength(cards('Js Jd'));
    const tt = preflopStrength(cards('10s 10d'));
    const eight = preflopStrength(cards('8s 8d'));
    const five = preflopStrength(cards('5s 5d'));
    expect(kk).toBeGreaterThanOrEqual(qq);
    expect(qq).toBeGreaterThan(jj);
    expect(jj).toBeGreaterThan(tt);
    expect(tt).toBeGreaterThan(eight);
    expect(eight).toBeGreaterThan(five);
  });

  it('suited прибавляет к силе vs offsuit тех же рангов', () => {
    // На AK suited не растёт — обе руки упираются в потолок 0.85; берём средние коннекторы.
    const suited = preflopStrength(cards('7s 6s'));
    const offsuit = preflopStrength(cards('7h 6d'));
    expect(suited).toBeGreaterThan(offsuit);
  });

  it('AKs сильнее, чем низкий разномастный коннектор', () => {
    expect(preflopStrength(cards('As Ks'))).toBeGreaterThan(preflopStrength(cards('7d 2c')));
  });

  it('некорректное число карт → 0', () => {
    expect(preflopStrength(cards('As'))).toBe(0);
    expect(preflopStrength(cards('As Kd Qh'))).toBe(0);
  });

  it('верхняя граница не-пары — 0.85', () => {
    expect(preflopStrength(cards('As Ks'))).toBeLessThanOrEqual(0.85);
  });
});

// ===== Post-flop strength =====

describe('postflopStrength — категории', () => {
  it('меньше 3 карт на борде → откат к preflopStrength', () => {
    expect(postflopStrength(cards('As Ad'), [])).toBe(preflopStrength(cards('As Ad')));
  });

  it('high-card → 0.10', () => {
    expect(postflopStrength(cards('As Kd'), cards('7c 2d 9h'))).toBe(0.10);
  });

  it('overpair (выше борда) → 0.62', () => {
    expect(postflopStrength(cards('As Ad'), cards('7c 2d 9h'))).toBe(0.62);
  });

  it('top pair с топ-кикером → 0.58', () => {
    expect(postflopStrength(cards('As Kd'), cards('Ac 2d 9h'))).toBe(0.58);
  });

  it('две пары → 0.70', () => {
    expect(postflopStrength(cards('As 9d'), cards('Ac 9h 2d'))).toBe(0.70);
  });

  it('сет → 0.80', () => {
    expect(postflopStrength(cards('9s 9d'), cards('9c 2d 7h'))).toBe(0.80);
  });

  it('фулл-хаус → 0.95', () => {
    expect(postflopStrength(cards('9s 9d'), cards('9c 2d 2h'))).toBe(0.95);
  });

  it('каре/стрит-флеш → 0.99', () => {
    expect(postflopStrength(cards('9s 9d'), cards('9c 9h 2d'))).toBe(0.99);
  });
});

// ===== Peek strength (showdown-симуляция) =====

describe('peekStrength — известный исход', () => {
  it('все оппоненты сфолдили → гарантированный выигрыш', () => {
    const r = peekStrength(cards('7h 2c'), cards('As Kd Qh 9s 3c'), [
      { cards: cards('Ah Ac'), isFolded: true },
    ]);
    expect(r).toEqual({ strength: 0.98, willWin: true, willTie: false });
  });

  it('моя рука сильнее → win', () => {
    const r = peekStrength(cards('As Ad'), cards('Ah 7c 2d 9s 3h'), [
      { cards: cards('Kh Kc'), isFolded: false },
    ]);
    expect(r.willWin).toBe(true);
    expect(r.strength).toBe(0.98);
  });

  it('моя рука слабее → loss', () => {
    const r = peekStrength(cards('7h 2c'), cards('Ah Kc 2d 9s 3h'), [
      { cards: cards('As Ad'), isFolded: false },
    ]);
    expect(r.willWin).toBe(false);
    expect(r.willTie).toBe(false);
    expect(r.strength).toBe(0.05);
  });

  it('равные руки → tie', () => {
    const r = peekStrength(cards('As Kd'), cards('Ah Ac Kh Kc 2d'), [
      { cards: cards('Ad Ks'), isFolded: false },
    ]);
    expect(r.willTie).toBe(true);
    expect(r.strength).toBe(0.50);
  });
});

// ===== PnL drift / zone =====

describe('computeRiskShift', () => {
  it('на target (zero, realized 0) → нулевой shift', () => {
    expect(computeRiskShift(0, 'zero', 100, 10)).toBeCloseTo(0, 10);
  });

  it('выше плана (realized > 0) → отрицательный shift (играть слабее)', () => {
    expect(computeRiskShift(500, 'zero', 100, 10)).toBeLessThan(0);
  });

  it('ниже плана (realized < 0) → положительный shift (играть сильнее)', () => {
    expect(computeRiskShift(-500, 'zero', 100, 10)).toBeGreaterThan(0);
  });

  it('зажат в [-0.25, 0.25]', () => {
    expect(computeRiskShift(1_000_000, 'zero', 100, 10)).toBe(-0.25);
    expect(computeRiskShift(-1_000_000, 'zero', 100, 10)).toBe(0.25);
  });
});

describe('computePnLZone', () => {
  it('сильно в плюсе → zone over, высокий allowedLoss, низкий push', () => {
    const z = computePnLZone(10_000, 'zero', 100, 10);
    expect(z.zone).toBe('over');
    expect(z.allowedLossNow).toBe(12 * 10);
    expect(z.needWinPressure).toBe(0.2);
  });

  it('около цели → zone neutral', () => {
    const z = computePnLZone(0, 'zero', 100, 10);
    expect(z.zone).toBe('neutral');
    expect(z.allowedLossNow).toBe(4 * 10);
    expect(z.needWinPressure).toBe(0.6);
  });

  it('сильно в минусе → zone under, бережёт стек, максимальный push', () => {
    const z = computePnLZone(-10_000, 'zero', 100, 10);
    expect(z.zone).toBe('under');
    expect(z.allowedLossNow).toBe(3 * 10);
    expect(z.needWinPressure).toBe(1.0);
  });
});

// ===== Размер raise =====

describe('computeRaiseSize', () => {
  it('не превышает стек (myChips + myCurrentBet)', () => {
    const rng = makeSeededRng(5);
    for (let i = 0; i < 50; i++) {
      const size = computeRaiseSize(20, 100, 10, 80, 20, 1.5, rng);
      expect(size).toBeLessThanOrEqual(80 + 20);
    }
  });

  it('больше currentBet при разумной агрессии и стеке', () => {
    const rng = makeSeededRng(3);
    const size = computeRaiseSize(20, 100, 10, 1000, 0, 0.6, rng);
    expect(size).toBeGreaterThan(20);
  });
});

// ===== Reaction time =====

describe('pickReactionTimeMs', () => {
  const persona: BotPersona = {
    aggression: 0.5, bluffRate: 0.15, heroFoldRate: 0.05, slowplayRate: 0.1,
    vpip: 0.5, reactionFast: [400, 900], reactionSlow: [1500, 3000], fastBias: 0.6,
  };

  it('всегда в объединённом диапазоне fast..slow', () => {
    const rng = makeSeededRng(7);
    for (let i = 0; i < 200; i++) {
      const t = pickReactionTimeMs(persona, rng);
      expect(t).toBeGreaterThanOrEqual(400);
      expect(t).toBeLessThanOrEqual(3000);
    }
  });
});

// ===== Runtime =====

describe('recordHandResult / createBotRuntime', () => {
  it('createBotRuntime — нулевой старт с handStartChips', () => {
    const rt = createBotRuntime(500);
    expect(rt.realizedPnL).toBe(0);
    expect(rt.handsPlayed).toBe(0);
    expect(rt.handStartChips).toBe(500);
    expect(rt.bluffEventHands).toEqual([]);
    expect(rt.bluffCallEventHands).toEqual([]);
  });

  it('накопление realizedPnL и сдвиг handStartChips', () => {
    const rt = createBotRuntime(1000);
    recordHandResult(rt, 1100, 10); // +100
    expect(rt.realizedPnL).toBe(100);
    expect(rt.handsPlayed).toBe(1);
    expect(rt.handStartChips).toBe(1100);
    recordHandResult(rt, 1050, 10); // -50
    expect(rt.realizedPnL).toBe(50);
    expect(rt.handsPlayed).toBe(2);
    expect(rt.handStartChips).toBe(1050);
  });

  it('sliding window 50 рук обрезает устаревшие bluff-события', () => {
    const rt = createBotRuntime(1000);
    rt.bluffEventHands = [1, 2, 3];
    rt.handsPlayed = 59; // после record станет 60, cutoff = 10 → [1,2,3] выпадают
    recordHandResult(rt, 1000, 10);
    expect(rt.bluffEventHands).toEqual([]);
  });
});

// ===== decideAction — golden characterization =====
// Точные значения сняты с текущей реализации (seed → детерминированный BotDecision).
// При распиле в пайплайн правил поведение должно остаться идентичным.

const GOLDEN_PERSONA: BotPersona = {
  aggression: 0.5, bluffRate: 0.15, heroFoldRate: 0.05, slowplayRate: 0.1,
  vpip: 0.5, reactionFast: [400, 900], reactionSlow: [1500, 3000], fastBias: 0.6,
};

function goldenCtx(over: Partial<BotDecisionContext>, seed: number): BotDecisionContext {
  const base: BotDecisionContext = {
    myCards: cards('As Ad'), myCurrentBet: 0, myChips: 1000,
    board: [], pot: 30, currentBet: 20, phase: 'preflop', bigBlind: 10, isLockedCaller: false,
    activeOpponents: [{ id: 'o1', cards: cards('7h 2c'), chips: 1000, currentBet: 20, isFolded: false, isBot: false }],
    futureBoard: [], persona: GOLDEN_PERSONA, targetPnL: 'zero', runtime: createBotRuntime(1000),
    lifetimePnL: 0, peekMode: 'river', rng: makeSeededRng(seed),
  };
  return { ...base, ...over, rng: makeSeededRng(seed) };
}

type Golden = { seed: number; action: string; tag?: string; amount: number | null };

const GOLDEN: Record<string, { over: Partial<BotDecisionContext>; expected: Golden[] }> = {
  'preflop-AA-vs-raise': {
    over: { myCards: cards('As Ad'), phase: 'preflop', currentBet: 20, pot: 30 },
    expected: [
      { seed: 1, action: 'call', tag: 'slowplay-call', amount: null },
      { seed: 2, action: 'raise', tag: 'normal-raise', amount: 70 },
      { seed: 3, action: 'call', tag: 'slowplay-call', amount: null },
      { seed: 7, action: 'fold', tag: 'hero-fold', amount: null },
      { seed: 42, action: 'raise', tag: 'normal-raise', amount: 60 },
    ],
  },
  'preflop-72o-weak': {
    over: { myCards: cards('7h 2c'), phase: 'preflop', currentBet: 20, pot: 30 },
    expected: [
      { seed: 1, action: 'fold', tag: 'pot-odds-fold', amount: null },
      { seed: 2, action: 'fold', tag: 'pot-odds-fold', amount: null },
      { seed: 3, action: 'fold', tag: 'pot-odds-fold', amount: null },
      { seed: 7, action: 'raise', tag: 'bluff', amount: 40 },
      { seed: 42, action: 'fold', tag: 'pot-odds-fold', amount: null },
    ],
  },
  'flop-toppair': {
    over: { myCards: cards('As Kd'), board: cards('Ah 7c 2d'), phase: 'flop', currentBet: 40, pot: 100 },
    expected: [
      { seed: 1, action: 'call', tag: 'value-call', amount: null },
      { seed: 2, action: 'call', tag: 'value-call', amount: null },
      { seed: 3, action: 'call', tag: 'value-call', amount: null },
      { seed: 7, action: 'fold', tag: 'mistake-fold', amount: null },
      { seed: 42, action: 'call', tag: 'value-call', amount: null },
    ],
  },
  'turn-peek-win': {
    over: { myCards: cards('As Ad'), board: cards('Ah 7c 2d 9s'), futureBoard: cards('Kc'), phase: 'turn', peekMode: 'full', currentBet: 50, pot: 150 },
    expected: [
      { seed: 1, action: 'raise', tag: 'value-raise', amount: 265 },
      { seed: 2, action: 'raise', tag: 'value-raise', amount: 250 },
      { seed: 3, action: 'raise', tag: 'value-raise', amount: 250 },
      { seed: 7, action: 'call', tag: 'slowplay-call', amount: null },
      { seed: 42, action: 'raise', tag: 'value-raise', amount: 220 },
    ],
  },
  'turn-peek-loss': {
    over: { myCards: cards('7h 2c'), board: cards('Ah Kc 2d 9s'), futureBoard: cards('Qc'), phase: 'turn', peekMode: 'full', currentBet: 50, pot: 150, activeOpponents: [{ id: 'o1', cards: cards('As Kd'), chips: 1000, currentBet: 50, isFolded: false, isBot: false }] },
    expected: [
      { seed: 1, action: 'fold', tag: 'peek-loss-fold-neutral', amount: null },
      { seed: 2, action: 'fold', tag: 'peek-loss-fold-neutral', amount: null },
      { seed: 3, action: 'fold', tag: 'peek-loss-fold-neutral', amount: null },
      { seed: 7, action: 'raise', tag: 'bluff', amount: 120 },
      { seed: 42, action: 'fold', tag: 'peek-loss-fold-neutral', amount: null },
    ],
  },
  'river-check-spot': {
    over: { myCards: cards('As Kd'), board: cards('Ah 7c 2d 9s 3h'), phase: 'river', currentBet: 0, myCurrentBet: 0, pot: 200 },
    expected: [
      { seed: 1, action: 'check', tag: 'peek-loss-check-neutral', amount: null },
      { seed: 2, action: 'check', tag: 'peek-loss-check-neutral', amount: null },
      { seed: 3, action: 'check', tag: 'peek-loss-check-neutral', amount: null },
      { seed: 7, action: 'raise', tag: 'bluff', amount: 70 },
      { seed: 42, action: 'check', tag: 'peek-loss-check-neutral', amount: null },
    ],
  },
};

describe('decideAction — golden фиксация поведения', () => {
  for (const [name, { over, expected }] of Object.entries(GOLDEN)) {
    describe(name, () => {
      for (const exp of expected) {
        it('seed=' + exp.seed + ' → ' + exp.action + '/' + exp.tag, () => {
          const d = decideAction(goldenCtx(over, exp.seed));
          expect(d.action).toBe(exp.action);
          expect(d.tag).toBe(exp.tag);
          expect(d.amount ?? null).toBe(exp.amount);
        });
      }
    });
  }

  it('один и тот же seed → идентичное решение (детерминизм)', () => {
    const a = decideAction(goldenCtx(GOLDEN['turn-peek-win'].over, 1));
    const b = decideAction(goldenCtx(GOLDEN['turn-peek-win'].over, 1));
    expect(a).toEqual(b);
  });
});

// decideAction должна быть ЧИСТОЙ относительно runtime: bluff-события возвращаются флагами,
// саму запись в runtime делает BotManager (ROADMAP §9.3-D).
describe('decideAction — чистота runtime (события наружу)', () => {
  it('bluff-решение: recordBluff=true, runtime.bluffEventHands НЕ мутируется', () => {
    const ctx = goldenCtx(GOLDEN['preflop-72o-weak'].over, 7); // seed 7 → tag 'bluff'
    const d = decideAction(ctx);
    expect(d.tag).toBe('bluff');
    expect(d.recordBluff).toBe(true);
    // decideAction не должна была толкать событие в runtime
    expect(ctx.runtime.bluffEventHands).toEqual([]);
  });

  it('не-bluff решение: recordBluff не выставлен', () => {
    const ctx = goldenCtx(GOLDEN['preflop-AA-vs-raise'].over, 2); // raise/normal
    const d = decideAction(ctx);
    expect(d.recordBluff).toBeUndefined();
    expect(ctx.runtime.bluffEventHands).toEqual([]);
  });
});

// §5.2 POKER_RULES: locked caller (после incomplete all-in) не может re-raise — сервер
// такое действие молча отклоняет (GameManager.handlePlayerAction), из-за чего стол
// подвисал навсегда (постмортем "зависшие боты" 2026-07-03). decideAction обязана сама
// понижать raise до call, чтобы бот не пытался сходить нелегально.
describe('decideAction — isLockedCaller понижает raise до call (§5.2)', () => {
  it('сценарий, где обычно raise → при isLockedCaller=true отдаёт call с тем же tag', () => {
    const normalCtx = goldenCtx(GOLDEN['preflop-AA-vs-raise'].over, 2);
    const normal = decideAction(normalCtx);
    expect(normal.action).toBe('raise'); // база: без лока бот рейзит

    const lockedCtx = goldenCtx({ ...GOLDEN['preflop-AA-vs-raise'].over, isLockedCaller: true }, 2);
    const locked = decideAction(lockedCtx);
    expect(locked.action).toBe('call');
    expect(locked.amount).toBeUndefined();
    expect(locked.tag).toBe(normal.tag); // остальные поля решения не теряются
  });

  it('isLockedCaller=true не трогает решения fold/call/check (только raise понижается)', () => {
    const foldCtx = goldenCtx({ ...GOLDEN['preflop-72o-weak'].over, isLockedCaller: true }, 1);
    const fold = decideAction(foldCtx);
    expect(fold.action).toBe('fold'); // как и без isLockedCaller (seed=1 → pot-odds-fold)
  });
});

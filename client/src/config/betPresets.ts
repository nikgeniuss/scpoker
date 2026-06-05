// Пресеты бет-сайзов для ActionPanel (см. roadmap 10.2 в CLAUDE.md)
// Хранение — localStorage, два контекста: open (префлоп без рейзов) и postflop (всё остальное)

export type OpenPreset =
  | { kind: 'bb'; value: number } // множитель ББ: 2BB, 2.5BB, ...
  | { kind: 'pot' };              // размер банка

export type PostflopPreset = { kind: 'percent'; value: number }; // % от банка

export interface BetPresets {
  open: OpenPreset[];        // ровно 4
  postflop: PostflopPreset[]; // ровно 4
  roundToBigBlind: boolean;
}

export const DEFAULT_BET_PRESETS: BetPresets = {
  open: [
    { kind: 'bb', value: 2 },
    { kind: 'bb', value: 3 },
    { kind: 'bb', value: 4 },
    { kind: 'pot' },
  ],
  postflop: [
    { kind: 'percent', value: 33 },
    { kind: 'percent', value: 50 },
    { kind: 'percent', value: 75 },
    { kind: 'percent', value: 100 },
  ],
  roundToBigBlind: true,
};

const STORAGE_KEY = 'sk:betPresets:v1';

// Допустимые значения для перебора стрелками < >
export const OPEN_BB_STEPS: number[] = [1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10];
export const POSTFLOP_PCT_STEPS: number[] = [20, 25, 33, 40, 50, 66, 75, 100, 125, 150, 200];

export function loadBetPresets(): BetPresets {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BET_PRESETS;
    const parsed = JSON.parse(raw) as Partial<BetPresets>;
    const open = Array.isArray(parsed.open) && parsed.open.length === 4 ? parsed.open : DEFAULT_BET_PRESETS.open;
    const postflop =
      Array.isArray(parsed.postflop) && parsed.postflop.length === 4
        ? parsed.postflop
        : DEFAULT_BET_PRESETS.postflop;
    return {
      open: open as OpenPreset[],
      postflop: postflop as PostflopPreset[],
      roundToBigBlind:
        typeof parsed.roundToBigBlind === 'boolean'
          ? parsed.roundToBigBlind
          : DEFAULT_BET_PRESETS.roundToBigBlind,
    };
  } catch {
    return DEFAULT_BET_PRESETS;
  }
}

export function saveBetPresets(p: BetPresets): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore (приватный режим / квота)
  }
}

// Контекст open: префлоп и никто ещё не повысил (currentBet === bigBlind)
export function isOpenContext(phase: string, currentBet: number, bigBlind: number): boolean {
  return phase === 'preflop' && currentBet === bigBlind;
}

interface CalcCtx {
  pot: number;
  currentBet: number;
  myBet: number;
  bigBlind: number;
  roundToBB: boolean;
}

function applyRound(amount: number, bigBlind: number, round: boolean): number {
  if (!round) return Math.round(amount);
  return Math.max(bigBlind, Math.round(amount / bigBlind) * bigBlind);
}

// Сумма для open-пресета. Возвращает total bet (raise to), не «дельту».
export function calcOpenAmount(preset: OpenPreset, ctx: CalcCtx): number {
  const callAmount = Math.max(0, ctx.currentBet - ctx.myBet);
  let raw: number;
  if (preset.kind === 'bb') {
    raw = preset.value * ctx.bigBlind;
  } else {
    // pot-size raise: total = currentBet + (pot после нашего колла)
    raw = ctx.currentBet + (ctx.pot + callAmount);
  }
  return applyRound(raw, ctx.bigBlind, ctx.roundToBB);
}

// Сумма для postflop-пресета. Возвращает total bet (raise to).
// Когда currentBet === 0 (никто не ставил на этой улице) — это бет, raw = pot * pct.
// Когда currentBet > 0 — это рейз, raw = currentBet + (pot + callAmount) * pct.
export function calcPostflopAmount(preset: PostflopPreset, ctx: CalcCtx): number {
  const callAmount = Math.max(0, ctx.currentBet - ctx.myBet);
  const pct = preset.value / 100;
  let raw: number;
  if (ctx.currentBet === 0) {
    raw = ctx.pot * pct;
  } else {
    raw = ctx.currentBet + (ctx.pot + callAmount) * pct;
  }
  return applyRound(raw, ctx.bigBlind, ctx.roundToBB);
}

// Короткие подписи кнопок
export function openPresetLabel(p: OpenPreset): string {
  if (p.kind === 'pot') return 'Банк';
  // 2 → "2 ББ", 2.5 → "2.5 ББ"
  const v = Number.isInteger(p.value) ? p.value.toString() : p.value.toString();
  return v + ' ББ';
}

export function postflopPresetLabel(p: PostflopPreset): string {
  return p.value + '%';
}

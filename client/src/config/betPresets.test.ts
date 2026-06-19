import { describe, it, expect, beforeEach } from 'vitest';
import {
  calcOpenAmount,
  calcPostflopAmount,
  isOpenContext,
  openPresetLabel,
  postflopPresetLabel,
  loadBetPresets,
  saveBetPresets,
  DEFAULT_BET_PRESETS,
} from './betPresets';

const ctx = (over: Partial<Parameters<typeof calcOpenAmount>[1]> = {}) => ({
  pot: 300,
  currentBet: 100,
  myBet: 0,
  bigBlind: 100,
  roundToBB: true,
  ...over,
});

describe('isOpenContext', () => {
  it('true только на префлопе без рейзов (currentBet === bigBlind)', () => {
    expect(isOpenContext('preflop', 100, 100)).toBe(true);
  });
  it('false если кто-то уже повысил', () => {
    expect(isOpenContext('preflop', 200, 100)).toBe(false);
  });
  it('false на постфлопе', () => {
    expect(isOpenContext('flop', 100, 100)).toBe(false);
  });
});

describe('calcOpenAmount', () => {
  it('bb-пресет: множитель на большой блайнд', () => {
    expect(calcOpenAmount({ kind: 'bb', value: 3 }, ctx())).toBe(300);
  });
  it('bb-пресет без округления отдаёт точную сумму', () => {
    expect(calcOpenAmount({ kind: 'bb', value: 2.5 }, ctx({ roundToBB: false }))).toBe(250);
  });
  it('bb-пресет с округлением до ББ снапит 2.5ББ→3ББ', () => {
    expect(calcOpenAmount({ kind: 'bb', value: 2.5 }, ctx())).toBe(300);
  });
  it('pot-пресет: total = currentBet + (банк + колл)', () => {
    // callAmount = 100, raw = 100 + (300 + 100) = 500
    expect(calcOpenAmount({ kind: 'pot' }, ctx())).toBe(500);
  });
});

describe('calcPostflopAmount', () => {
  it('бет (currentBet=0): процент от банка', () => {
    // raw = 300 * 0.5 = 150 → округление до ББ = 200
    expect(calcPostflopAmount({ kind: 'percent', value: 50 }, ctx({ currentBet: 0 }))).toBe(200);
  });
  it('бет без округления отдаёт точный процент', () => {
    expect(
      calcPostflopAmount({ kind: 'percent', value: 50 }, ctx({ currentBet: 0, roundToBB: false })),
    ).toBe(150);
  });
  it('рейз (currentBet>0): currentBet + (банк + колл) * процент', () => {
    // callAmount = 100, raw = 100 + (300 + 100) * 1 = 500
    expect(calcPostflopAmount({ kind: 'percent', value: 100 }, ctx())).toBe(500);
  });
});

describe('подписи пресетов', () => {
  it('openPresetLabel', () => {
    expect(openPresetLabel({ kind: 'pot' })).toBe('Банк');
    expect(openPresetLabel({ kind: 'bb', value: 2 })).toBe('2 ББ');
    expect(openPresetLabel({ kind: 'bb', value: 2.5 })).toBe('2.5 ББ');
  });
  it('postflopPresetLabel', () => {
    expect(postflopPresetLabel({ kind: 'percent', value: 50 })).toBe('50%');
  });
});

describe('loadBetPresets / saveBetPresets', () => {
  beforeEach(() => localStorage.clear());

  it('дефолт при пустом хранилище', () => {
    expect(loadBetPresets()).toEqual(DEFAULT_BET_PRESETS);
  });

  it('round-trip сохранения', () => {
    const custom = { ...DEFAULT_BET_PRESETS, roundToBigBlind: false };
    saveBetPresets(custom);
    expect(loadBetPresets().roundToBigBlind).toBe(false);
  });

  it('битый JSON в хранилище → дефолт', () => {
    localStorage.setItem('sk:betPresets:v1', '{not json');
    expect(loadBetPresets()).toEqual(DEFAULT_BET_PRESETS);
  });
});

import { describe, it, expect } from 'vitest';
import { buildFillerPersona, weakenPersona, TOURNAMENT_BOT_WEAKNESS } from '../tournamentFillerPersonas.js';
import { hashStr } from '../botBrain.js';
import type { BotPersona } from '../botBrain.js';

// Турнирные боты играют на слив и должны быть заметно слабее кэш-ботов: меньше агрессии/блефа/
// хиро-фолдов, больше vpip (заходят в мусорные руки). Коэффициент — TOURNAMENT_BOT_WEAKNESS.
const base: BotPersona = {
  aggression: 0.20, bluffRate: 0.02, heroFoldRate: 0.04, slowplayRate: 0.10, vpip: 0.60,
  reactionFast: [700, 1600], reactionSlow: [2200, 4200], fastBias: 0.7,
};

describe('weakenPersona — ослабление турнирных ботов', () => {
  it('срезает агрессию, блеф и хиро-фолд на заданный процент', () => {
    const weak = weakenPersona(base, 0.15);
    expect(weak.aggression).toBeCloseTo(0.20 * 0.85, 6);
    expect(weak.bluffRate).toBeCloseTo(0.02 * 0.85, 6);
    expect(weak.heroFoldRate).toBeCloseTo(0.04 * 0.85, 6);
  });

  it('поднимает vpip — бот заходит в БОЛЬШЕЕ число рук (это и есть слабость)', () => {
    const weak = weakenPersona(base, 0.15);
    expect(weak.vpip).toBeCloseTo(0.60 * 1.15, 6);
    expect(weak.vpip).toBeGreaterThan(base.vpip);
  });

  it('не трогает тайминги и slowplay — это не про силу игры', () => {
    const weak = weakenPersona(base, 0.15);
    expect(weak.slowplayRate).toBe(base.slowplayRate);
    expect(weak.reactionFast).toEqual(base.reactionFast);
    expect(weak.reactionSlow).toEqual(base.reactionSlow);
  });

  it('держит значения в [0,1] даже при большом коэффициенте', () => {
    const weak = weakenPersona({ ...base, vpip: 0.95 }, 0.9);
    expect(weak.vpip).toBeLessThanOrEqual(1);
    expect(weak.aggression).toBeGreaterThanOrEqual(0);
  });

  it('дефолтный коэффициент = TOURNAMENT_BOT_WEAKNESS', () => {
    expect(weakenPersona(base)).toEqual(weakenPersona(base, TOURNAMENT_BOT_WEAKNESS));
  });
});

describe('buildFillerPersona — персона бота-заполнителя', () => {
  it('детерминирована по seed (один бот — одна персона между рестартами)', () => {
    const a = buildFillerPersona(hashStr('bot:fill-timur91'));
    const b = buildFillerPersona(hashStr('bot:fill-timur91'));
    expect(a).toEqual(b);
  });

  it('заметно слабее исходных архетипов: низкая агрессия и высокий vpip', () => {
    // Архетипы: aggression 0.18-0.22, vpip 0.58-0.62. После ослабления и джиттера (±10%)
    // агрессия обязана остаться низкой, а vpip — выше исходной планки.
    for (const name of ['bot:fill-yarik74', 'bot:fill-alina53', 'bot:fill-luka34']) {
      const p = buildFillerPersona(hashStr(name));
      expect(p.aggression).toBeLessThan(0.22);
      expect(p.bluffRate).toBeLessThan(0.02);
      expect(p.vpip).toBeGreaterThan(0.55);
      expect(p.vpip).toBeLessThanOrEqual(1);
    }
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { BotManager } from '../BotManager.js';
import type { BotModeSettings } from '../BotManager.js';

// Seed решений бота раньше складывался только из публичных величин: botId уходит клиенту в каждом
// GAME_UPDATE, handIndex досчитывается наблюдением за столом, mulberry32 — открытый алгоритм.
// Значит поведение бота можно было предсказать (security review 2026-08-24). Теперь в seed
// подмешана секретная соль процесса.
const settings = { enabled: false, peekMode: 'river', tablesPerLevel: 1 } as unknown as BotModeSettings;
const gmStub = {} as never;

const draw = (rng: () => number, n = 5) => Array.from({ length: n }, () => rng());

describe('BotManager.makeRngForHand — непредсказуемость seed', () => {
  it('внутри одного процесса детерминирован: та же раздача → та же последовательность', () => {
    const bm = new BotManager(gmStub, settings);
    expect(draw(bm.makeRngForHand('bot:alice', 7))).toEqual(draw(bm.makeRngForHand('bot:alice', 7)));
  });

  it('разные боты и разные раздачи расходятся', () => {
    const bm = new BotManager(gmStub, settings);
    expect(draw(bm.makeRngForHand('bot:alice', 7))).not.toEqual(draw(bm.makeRngForHand('bot:bob', 7)));
    expect(draw(bm.makeRngForHand('bot:alice', 7))).not.toEqual(draw(bm.makeRngForHand('bot:alice', 8)));
  });

  it('по публичным botId+handIndex предсказать нельзя: у другого процесса та же пара даёт другое', () => {
    // Два экземпляра = два «процесса» с разной солью. Раньше оба давали идентичный поток.
    const runs = Array.from({ length: 8 }, () => draw(new BotManager(gmStub, settings).makeRngForHand('bot:alice', 7)).join(','));
    expect(new Set(runs).size).toBeGreaterThan(1);
  });

  it('поток остаётся валидными числами [0,1)', () => {
    const bm = new BotManager(gmStub, settings);
    for (const v of draw(bm.makeRngForHand('bot:alice', 3), 50)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

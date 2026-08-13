import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import type { GameManager } from '../GameManager.js';

// Незаметное заполнение турниров ботами (roadmap 2026-07-09) — пул человеческих персон,
// отдельный от кэш-пула (DEFAULT_BOT_PERSONAS) и от ручных тестовых ботов (bot:tt-).
describe('BotManager — пул персон-заполнителей для турниров', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('пул содержит ≥100 персон, все с префиксом bot:fill- и targetPnL=minus', async () => {
    const { gm } = await createTestGameManager();
    const botManager = (gm as unknown as GameManager).getBotManager();

    const pool = botManager.getFillerPersonaPool();
    expect(pool.length).toBeGreaterThanOrEqual(100);
    expect(pool.every((b) => b.id.startsWith('bot:fill-'))).toBe(true);
    expect(pool.every((b) => b.targetPnL === 'minus')).toBe(true);
    // Имена уникальны — иначе в одном турнире с большим числом заполнителей были бы видимые повторы.
    expect(new Set(pool.map((b) => b.username)).size).toBe(pool.length);
  });

  it('prepareFillerBot выставляет стартовый стек и сбрасывает runtime; отклоняет чужие/неизвестные id', async () => {
    const { gm } = await createTestGameManager();
    const botManager = (gm as unknown as GameManager).getBotManager();
    const candidate = botManager.getFillerPersonaPool()[0];

    const prepared = botManager.prepareFillerBot(candidate.id, 7500);
    expect(prepared?.chips).toBe(7500);
    expect(botManager.getBotRuntime(candidate.id)?.handStartChips).toBe(7500);
    expect(botManager.getBotRuntime(candidate.id)?.realizedPnL).toBe(0);

    expect(botManager.prepareFillerBot('bot:noop', 1000)).toBeNull(); // не из filler-пула
    expect(botManager.prepareFillerBot('bot:fill-does-not-exist', 1000)).toBeNull();
  });
});

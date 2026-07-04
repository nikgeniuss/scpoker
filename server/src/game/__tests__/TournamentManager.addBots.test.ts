import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// Тестовые боты турнира (доделка §10.6/roadmap 2026-07-03) — добавление N ботов мимо банкролла,
// для живого прогона тестового турнира без реальных игроков. Боты loose-passive + target='minus'
// (стабильно сливают стек), их id имеет префикс bot:tt- и НЕ участвует в cash-пуле BotManager.

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

describe('TournamentManager.addBots — тестовые боты турнира', () => {
  beforeEach(() => {
    resetStorage({ users: ['A'].map((id) => ({ id, username: id, chips: 5000 })) });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('добавляет N ботов в MTT мимо банкролла: entries, без списания, без изменения prizePool', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Bot Test MTT', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 7500, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 5 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    const result = tm.addBots(id, 3);
    if ('error' in result) throw new Error(result.error);

    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((e) => e.userId.startsWith('bot:tt-'))).toBe(true);
    expect(result.entries.every((e) => e.status === 'registered')).toBe(true);
    expect(result.prizePool).toBe(0); // боты не платят бай-ин
    expect(usersChips()).toMatchObject({ A: 5000 }); // реальный банкролл не тронут

    // Персоны созданы в BotRepository с target='minus'.
    const botManager = gm.getBotManager();
    result.entries.forEach((e) => {
      const bot = botManager.getBot(e.userId);
      expect(bot?.targetPnL).toBe('minus');
      expect(bot?.chips).toBe(7500);
    });
  });

  it('SNG: боты капаются местами за столом и триггерят авто-старт при заполнении', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Bot Test SNG', type: 'sng', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 5 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    // Просим 5 ботов при tableSize=3 — должно докапаться до 3 и стартовать.
    const result = tm.addBots(id, 5);
    if ('error' in result) throw new Error(result.error);

    expect(result.entries).toHaveLength(3);
    expect(result.status).toBe('running');
    expect(result.tableIds).toHaveLength(1);
  });

  it('отклоняет невалидное количество и запросы вне registering', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Bot Reject MTT', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 5 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    expect(tm.addBots(id, 0)).toEqual({ error: 'invalid-bot-count' });
    expect(tm.addBots(id, 51)).toEqual({ error: 'invalid-bot-count' });
    expect(tm.addBots('missing-id', 3)).toEqual({ error: 'not-found' });

    const cancelled = tm.cancel(id);
    if ('error' in cancelled) throw new Error(cancelled.error);
    expect(tm.addBots(id, 3)).toEqual({ error: 'invalid-status' });
  });
});

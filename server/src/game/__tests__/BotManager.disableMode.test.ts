import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import type { GameManager } from '../GameManager.js';

// Регрессия (2026-07-07, найдено живым тестом в браузере: выключили режим ботов через
// PUT /api/admin/settings, а 3 авто-стола остались висеть): disableMode() закрывал авто-столы
// только по карте УЖЕ ПОДСЕВШИХ ботов (botTable), а не по карте самих СОЗДАННЫХ авто-столов
// (botTableLevels). Боты подсаживаются волнами со сдвигом (createTableWithBots — часть сразу,
// часть «придут позже» через setTimeout) — если на момент выключения ни один бот ещё не подсел
// (сервер только что перезапустился, столы созданы секунды назад), botTable пуст, и стол
// переживал disable. Починено: закрывать по объединению botTableLevels.keys() ∪ botTable.values().
describe('BotManager — disableMode закрывает авто-столы даже без подсевших ботов', () => {
  beforeEach(() => {
    resetStorage();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('стол зарегистрирован в botTableLevels (создан), но botTable ещё пуст (0 подсевших) — всё равно закрывается при disableMode()', async () => {
    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;
    const botManager = realGm.getBotManager();

    const roomId = realGm.createBotTable({ level: 'micro', name: 'Тестовый авто-стол', smallBlind: 1, bigBlind: 2, maxPlayers: 6 });
    expect(roomId).toBeTruthy();

    // Момент ДО первой посадки бота (staggered arrival ещё не сработал) — именно он воспроизводит
    // баг: стол создан (зарегистрирован в botTableLevels), а botTable (карта подсевших) пуст.
    (botManager as unknown as { botTableLevels: Map<string, string> }).botTableLevels.set(roomId!, 'micro');
    expect(realGm.getAdminRoomList().find((r) => r.id === roomId)?.isBotTable).toBe(true);

    botManager.disableMode();

    expect(realGm.getAdminRoomList().find((r) => r.id === roomId)).toBeUndefined();
  });
});

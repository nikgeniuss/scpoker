import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { DEFAULT_BOT_PERSONAS } from '../defaultBotPersonas.js';
import type { GameManager } from '../GameManager.js';

// Регрессия (найдено 2026-08-11 живым прогоном: боты не подсаживались за столы, chips
// кэш-пула стабильно у нуля). autoRefillForBuyIn считал "eligible"-ботов БЕЗ фильтра
// bot:fill-/bot:tt- (в отличие от pickBotsForTable, который эти префиксы исключает) — богатые
// боты-заполнители турниров маскировали нехватку чипов у реального кэш-пула: eligible.length
// оказывался большим ЗА СЧЁТ филлеров, рефилл считался ненужным, а кэш-боты (единственные
// годные для pickBotsForTable) навсегда оставались без денег.
describe('BotManager — autoRefillForBuyIn не путает филлер/тест-ботов с кэш-пулом', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('слитый в ноль кэш-пул рефиллится и садится за авто-стол, даже если рядом богатые bot:fill-/bot:tt-', async () => {
    // Весь дефолтный кэш-пул — "слитый" (chips=10, как в реальном прод bots.json на момент
    // находки бага). Даём ВСЕ default-имена явно, чтобы mergeNewPersonas() в loadBots() не
    // подмешал их же заново со свежими 5000 chips (она добавляет только ОТСУТСТВУЮЩИЕ id).
    const bustedCashPool = DEFAULT_BOT_PERSONAS.map((d) => ({
      id: 'bot:' + d.name.toLowerCase(),
      username: d.name,
      chips: 10,
      targetPnL: d.target,
      persona: d.persona,
      createdAt: new Date(0).toISOString(),
      totalPnL: 0,
    }));
    const richOutsiders = [
      { id: 'bot:fill-rich1', username: 'Rich1', chips: 50000, targetPnL: 'minus' as const, persona: bustedCashPool[0].persona, createdAt: new Date(0).toISOString(), totalPnL: 0 },
      { id: 'bot:fill-rich2', username: 'Rich2', chips: 50000, targetPnL: 'minus' as const, persona: bustedCashPool[0].persona, createdAt: new Date(0).toISOString(), totalPnL: 0 },
      { id: 'bot:tt-rich3', username: 'Rich3', chips: 50000, targetPnL: 'minus' as const, persona: bustedCashPool[0].persona, createdAt: new Date(0).toISOString(), totalPnL: 0 },
    ];

    resetStorage({
      settings: {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        timebank: { enabled: true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60, allowPerTableOverride: false },
        // botsPerTable=2 → BOT_TABLE_MIN тоже 2 → target/needed всегда ровно 2 (детерминированно).
        botMode: { enabled: true, peekMode: 'river', tablesPerLevel: 1, botsPerTable: 2, defaultBuyInBb: 100, refillIntervalMs: 120_000 },
      },
      bots: [...bustedCashPool, ...richOutsiders],
    });

    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;
    const botManager = realGm.getBotManager();

    // Микро-стол: buyIn = bigBlind(2) × defaultBuyInBb(100) = 200. До фикса сюда никто бы не
    // сел — pickBotsForTable не находит ни одного кандидата с chips>=200 (весь кэш-пул слит
    // в 10, а autoRefillForBuyIn считал рефилл ненужным из-за богатых bot:fill-/bot:tt-).
    const microTable = realGm.getAdminRoomList().find((r) => r.isBotTable && r.smallBlind === 1 && r.bigBlind === 2);
    expect(microTable).toBeTruthy();
    expect(microTable!.players.length).toBeGreaterThan(0);
    // Каждый посаженный сел ровно с buyIn (200) — подтверждает, что рефилл реально поднял его
    // chips выше 200 ДО посадки (иначе seatBot отбил бы по guard'у bot.chips < buyIn).
    expect(microTable!.players.every((p) => p.chips === 200)).toBe(true);

    // Богатые филлер/тест-боты НЕ должны попасть на кэш-стол — они зарезервированы за турнирами.
    expect(microTable!.players.some((p) => p.id.startsWith('bot:fill-') || p.id.startsWith('bot:tt-'))).toBe(false);

    // Хотя бы часть слитого кэш-пула реально рефиллилась (иначе микро-стол не заполнился бы).
    const stillBusted = bustedCashPool.filter((b) => botManager.getBot(b.id)!.chips <= 10).length;
    expect(stillBusted).toBeLessThan(bustedCashPool.length);
  });
});

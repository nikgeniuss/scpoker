import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// Незаметное заполнение турниров ботами (roadmap 2026-07-09): в отличие от addBots() (ручной
// debug-инструмент "Тестбот-XXXXX"), эти боты — человеческие имена из пула tournamentFillerPersonas.ts,
// регистрируются поэтапно по таймерам (не все сразу), платят бай-ин/баунти как обычный участник
// (house-funded, без bankroll-списания), никогда не заходят повторно после вылета.

describe('TournamentManager — незаметное заполнение ботами (fillWithBots)', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'A', username: 'Alice', chips: 5000 }, { id: 'B', username: 'Bob', chips: 5000 }] });
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('create() требует botFillTarget 1..100 при fillWithBots=true', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const base = {
      name: 'X', type: 'sng' as const, format: 'nlh' as const, buyIn: 0, startingStack: 1000,
      tableSize: 6, blindSpeed: 'regular' as const, levelUpMinutes: 10,
    };
    expect(tm.create({ ...base, fillWithBots: true }, 'admin1')).toEqual({ error: 'invalid-bot-fill-target' });
    expect(tm.create({ ...base, fillWithBots: true, botFillTarget: 0 }, 'admin1')).toEqual({ error: 'invalid-bot-fill-target' });
    expect(tm.create({ ...base, fillWithBots: true, botFillTarget: 101 }, 'admin1')).toEqual({ error: 'invalid-bot-fill-target' });

    const ok = tm.create({ ...base, fillWithBots: true, botFillTarget: 5 }, 'admin1');
    if ('error' in ok) throw new Error(ok.error);
    expect(ok.fillWithBots).toBe(true);
    expect(ok.botFillTarget).toBe(5);
    expect(ok.entries).toHaveLength(0); // ничего не регистрируется мгновенно — только по таймерам
  });

  it('SNG: боты-заполнители докапывают стол постепенно, платят бай-ин, триггерят авто-старт по заполнению', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Fill SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 5000, tableSize: 4, blindSpeed: 'turbo', levelUpMinutes: 5, fillWithBots: true, botFillTarget: 4 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    expect(tm.get(id)!.entries).toHaveLength(0);

    vi.advanceTimersByTime(10 * 60_000); // покрывает 8-минутное окно ранней стадии с запасом

    const after = tm.get(id)!;
    expect(after.entries).toHaveLength(4);
    expect(after.entries.every((e) => e.userId.startsWith('bot:fill-'))).toBe(true);
    expect(new Set(after.entries.map((e) => e.userId)).size).toBe(4); // без дублей
    expect(after.prizePool).toBe(1000 * 4); // каждый бот "платит" бай-ин как обычный игрок
    // Авто-старт SNG по заполнению стола ботами — за 10 виртуальных минут боты (реальный GameManager)
    // успевают не только подсесть, но иногда и доиграть до финиша, поэтому не фиксируем 'running' жёстко.
    expect(after.status).not.toBe('registering');
  });

  it('MTT: боты-заполнители могут зайти ещё на этапе обычной регистрации (до старта)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // детерминируем задержки — все на минимуме окна
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Fill MTT Early', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 5000, tableSize: 6, blindSpeed: 'turbo', levelUpMinutes: 5, lateRegMinutes: 20, fillWithBots: true, botFillTarget: 5 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    expect(tm.get(id)!.entries).toHaveLength(0);

    vi.advanceTimersByTime(10_000); // минимальная задержка ранней стадии (10с)

    const after = tm.get(id)!;
    expect(after.status).toBe('registering'); // турнир ещё не стартовал
    const fillerEntries = after.entries.filter((e) => e.userId.startsWith('bot:fill-'));
    expect(fillerEntries).toHaveLength(3); // ~60% от цели=5 уходит на раннюю стадию
    expect(fillerEntries.every((e) => e.status === 'registered')).toBe(true);
  });

  it('MTT: если форс-старт происходит раньше первых заполнителей — остаток докапывается на поздней регистрации', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Fill MTT Late', type: 'mtt', format: 'nlh', buyIn: 200, startingStack: 5000, tableSize: 6, blindSpeed: 'turbo', levelUpMinutes: 5, lateRegMinutes: 15, fillWithBots: true, botFillTarget: 4 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    tm.register(id, 'A', 'Alice');
    tm.register(id, 'B', 'Bob');

    // forceStart сразу — раньше минимальной задержки ранней стадии (10с), ни один бот ещё не зашёл.
    const forced = tm.forceStart(id);
    if ('error' in forced) throw new Error(forced.error);
    expect(forced.entries.filter((e) => e.userId.startsWith('bot:fill-'))).toHaveLength(0);

    vi.advanceTimersByTime(15 * 60_000); // всё окно поздней регистрации

    const final = tm.get(id)!;
    const fillerEntries = final.entries.filter((e) => e.userId.startsWith('bot:fill-'));
    expect(fillerEntries).toHaveLength(4); // весь недобор ушёл в позднюю рег.
    expect(new Set(fillerEntries.map((e) => e.userId)).size).toBe(4);
    // За 15 виртуальных минут боты (реальный GameManager) успевают не только сесть, но иногда и
    // выбыть — важно, что все реально СЕЛИ за стол (playing/eliminated), а не застряли в 'registered'.
    expect(fillerEntries.every((e) => e.status === 'playing' || e.status === 'eliminated')).toBe(true);
    expect(final.prizePool).toBe(200 * (2 + 4)); // 2 реальных игрока + 4 бота, все платят бай-ин
  });

  it('боты-заполнители никогда не заходят повторно: итоговое число не превышает botFillTarget', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Fill No Reentry', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 5000, tableSize: 9, blindSpeed: 'turbo', levelUpMinutes: 5, lateRegMinutes: 10, reEntryEnabled: true, maxReEntries: 5, fillWithBots: true, botFillTarget: 6 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    tm.register(id, 'A', 'Alice');
    tm.register(id, 'B', 'Bob');
    tm.forceStart(id);

    // Продолжаем крутить время далеко за пределы окна поздней рег. — новых попыток сверх
    // изначально запланированных быть не должно (никакого цикла ре-энтри для ботов).
    vi.advanceTimersByTime(60 * 60_000);

    const final = tm.get(id)!;
    const fillerEntries = final.entries.filter((e) => e.userId.startsWith('bot:fill-'));
    expect(fillerEntries.length).toBeLessThanOrEqual(6);
    expect(new Set(fillerEntries.map((e) => e.userId)).size).toBe(fillerEntries.length);
  });
});

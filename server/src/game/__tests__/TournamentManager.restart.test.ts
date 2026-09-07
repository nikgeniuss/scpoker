import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// Running-турнир должен пережить рестарт сервера. Игроки турнирных столов живут только в памяти
// GameManager (rooms.json хранит конфиг стола, без состава), поэтому после рестарта столы
// поднимаются ПУСТЫМИ: блайнды растут, никто не выбывает, finish() не наступает — турнир висит
// вечно (живой прогон 2026-09-02, «Тест1» докрутился до потолка лестницы на пустом столе).
// Лечится снимком стеков в entries + пересадкой в restoreTournaments.

type StateView = { players: Array<{ id: string; chips: number }> };

const OPTS = {
  name: 'Restart MTT', type: 'mtt' as const, format: 'nlh' as const, buyIn: 1000,
  startingStack: 5000, tableSize: 4, blindSpeed: 'turbo' as const, levelUpMinutes: 10,
};

async function startedTournament() {
  const { gm } = await createTestGameManager();
  const tm = new TournamentManager(gm as unknown as GameManager);
  const created = tm.create(OPTS, 'admin1');
  if ('error' in created) throw new Error(created.error);
  ['A', 'B', 'C'].forEach((u) => tm.register(created.id, u, u));
  const started = tm.forceStart(created.id);
  if ('error' in started) throw new Error(started.error);
  return { gm, tm, id: created.id };
}

describe('TournamentManager — running-турнир переживает рестарт', () => {
  beforeEach(() => {
    resetStorage({ users: ['A', 'B', 'C'].map((id) => ({ id, username: id, chips: 50_000 })) });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('после рестарта игроки пересажены за свои столы, турнир снова играет', async () => {
    const { tm, id } = await startedTournament();
    const tableId = tm.get(id)!.entries.find((e) => e.status === 'playing')!.tableId!;

    // Рестарт: новый GameManager (комнаты из rooms.json — уже без игроков) + новый TournamentManager.
    const { gm: gm2 } = await createTestGameManager();
    expect((gm2.getGameState(tableId) as unknown as StateView).players).toHaveLength(0); // стол пуст

    const tm2 = new TournamentManager(gm2 as unknown as GameManager);
    tm2.restoreTournaments();

    const seated = (gm2.getGameState(tableId) as unknown as StateView).players;
    expect(seated.length).toBeGreaterThan(0); // раньше тут оставался ноль — турнир висел навсегда
    const alive = tm2.get(id)!.entries.filter((e) => e.status === 'playing');
    expect(seated.map((p) => p.id).sort()).toEqual(alive.map((e) => e.userId).sort());
  });

  it('пересаживает с сохранённым стеком, а не со стартовым', async () => {
    const { gm, tm, id } = await startedTournament();
    const entries = tm.get(id)!.entries.filter((e) => e.status === 'playing');
    const tableId = entries[0].tableId!;
    const victim = entries[0].userId;

    // Стеки за столом разошлись с startingStack — сообщаем их турниру тем же хуком, что и cleanupHand.
    const stacks: Record<string, number> = {};
    entries.filter((e) => e.tableId === tableId).forEach((e) => { stacks[e.userId] = 7777; });
    stacks[victim] = 1234;
    (gm as unknown as GameManager).onTournamentStacks!(tableId, stacks);
    expect(tm.get(id)!.entries.find((e) => e.userId === victim)!.chips).toBe(1234);

    const { gm: gm2 } = await createTestGameManager();
    const tm2 = new TournamentManager(gm2 as unknown as GameManager);
    tm2.restoreTournaments();

    // Стек сохранён в снимке...
    expect(tm2.get(id)!.entries.find((e) => e.userId === victim)!.chips).toBe(1234);
    // ...и игрок сел именно с ним, а не со стартовыми 5000. Точного равенства не ждём: сразу за
    // пересадкой возобновляется раздача и списывает блайнды/анте.
    const seated = (gm2.getGameState(tableId) as unknown as StateView).players;
    const chipsAtTable = seated.find((p) => p.id === victim)!.chips;
    expect(chipsAtTable).toBeLessThanOrEqual(1234);
    expect(chipsAtTable).toBeGreaterThan(1234 - OPTS.startingStack / 10);
    expect(chipsAtTable).not.toBe(OPTS.startingStack);
  });

  it('выбывших обратно за стол не сажает', async () => {
    const { gm, tm, id } = await startedTournament();
    const entries = tm.get(id)!.entries.filter((e) => e.status === 'playing');
    const tableId = entries[0].tableId!;
    const out = entries[0].userId;

    gm.removePlayer(tableId, out); // форфейт → статус eliminated

    const { gm: gm2 } = await createTestGameManager();
    const tm2 = new TournamentManager(gm2 as unknown as GameManager);
    tm2.restoreTournaments();

    const seated = (gm2.getGameState(tableId) as unknown as StateView).players.map((p) => p.id);
    expect(seated).not.toContain(out);
  });
});

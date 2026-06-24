import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import { computeMttPayout } from '../tournament/tournamentPayout.js';
import type { GameManager } from '../GameManager.js';

// MTT — мультистол (ROADMAP §10.19, Фаза 2): рассадка по нескольким столам, поздняя регистрация,
// элиминации через форфейт (детерминированно, без ригнутых раздач — карты не нужны для проверки
// именно мультистоловой механики: рассадка/поздний рег/банкролл/выплата по ITM-кривой/закрытие
// столов). Балансировка/консолидация между столами как чистый алгоритм — отдельно в
// tournamentBalancing.test.ts; механика переноса игрока между столами — в
// GameManager.tournamentMove.test.ts. Здесь — сквозная связка TournamentManager поверх них.

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

function aliveEntries(tm: TournamentManager, id: string) {
  return tm.get(id)!.entries.filter((e) => e.status === 'playing');
}

describe('TournamentManager — MTT, мультистол', () => {
  beforeEach(() => {
    resetStorage({
      users: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, username: id, chips: 5000 })),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('рассадка по нескольким столам, поздняя регистрация, элиминации до финиша по ITM-кривой', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Test MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 10, itmPercent: 20,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    // 5 регистрантов — НЕ авто-стартует (MTT стартует только force-start).
    ['A', 'B', 'C', 'D', 'E'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    expect(tm.get(id)!.status).toBe('registering');
    expect(tm.get(id)!.prizePool).toBe(5000);
    expect(usersChips()).toMatchObject({ A: 4000, B: 4000, C: 4000, D: 4000, E: 4000, F: 5000 });

    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    const running = tm.get(id)!;
    expect(running.status).toBe('running');
    // ceil(5/2) = 3 стола, размеры — [2,2,1] в каком-то порядке.
    expect(running.tableIds).toHaveLength(3);
    expect(running.entries.every((e) => e.status === 'playing' && e.tableId)).toBe(true);
    const sizes = running.tableIds
      .map((tid) => running.entries.filter((e) => e.tableId === tid).length)
      .sort((a, b) => b - a);
    expect(sizes).toEqual([2, 2, 1]);

    // Турнирные фишки — НЕ банкролл: посадка не двигает банкролл.
    expect(usersChips()).toMatchObject({ A: 4000, B: 4000, C: 4000, D: 4000, E: 4000 });

    // Поздняя регистрация: F присоединяется во время running, в окне lateRegMinutes.
    const lateReg = tm.register(id, 'F', 'F');
    if ('error' in lateReg) throw new Error(lateReg.error);
    expect(lateReg.prizePool).toBe(6000);
    const fEntry = lateReg.entries.find((e) => e.userId === 'F')!;
    expect(fEntry.status).toBe('playing');
    expect(fEntry.tableId).toBeTruthy();
    expect(usersChips()).toMatchObject({ F: 4000 });

    // Окно позднего рега закрыто — повторно/после дедлайна не зарегистрироваться (тут просто
    // повторная регистрация уже состоящего F — идемпотентный отказ).
    expect(tm.register(id, 'F', 'F')).toEqual({ error: 'already-registered' });

    // Элиминации (форфейт через leaveRoom-путь — детерминированно, без раздачи карт) до победителя.
    let guard = 0;
    while (aliveEntries(tm, id).length > 1 && guard < 10) {
      const victim = aliveEntries(tm, id)[0];
      gm.removePlayer(victim.tableId!, victim.userId);
      guard++;
    }
    expect(guard).toBeLessThan(10); // не зависли — дошли до финиша

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toBeTypeOf('number');
    expect(finished.tableIds).toHaveLength(0); // все столы закрыты

    const winners = finished.entries.filter((e) => e.finishPlace === 1);
    expect(winners).toHaveLength(1);
    const winner = winners[0];

    // 6 участников, ITM 20% → round(6*0.2)=1 призовое место — победителю весь призовой фонд.
    const payout = computeMttPayout(6000, 6, 20);
    expect(payout).toEqual({ 1: 6000 });
    expect(winner.prize).toBe(6000);

    // Остальные 5 — без призовых (paidPlaces=1).
    const losers = finished.entries.filter((e) => e.userId !== winner.userId);
    expect(losers).toHaveLength(5);
    expect(losers.every((e) => !e.prize)).toBe(true);

    // Банкролл: проигравшие остались на уровне после дебета бай-ина (4000), победитель + 6000.
    const chips = usersChips();
    losers.forEach((e) => expect(chips[e.userId]).toBe(4000));
    expect(chips[winner.userId]).toBe(4000 + 6000);

    // Все столы реально закрыты в GameManager (entries сохранены для истории).
    expect(running.tableIds.every((tid) => gm.getGameState(tid) === null)).toBe(true);
  });

  it('отмена в registering возвращает бай-ин всем зарегистрированным (MTT)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Cancel MTT', type: 'mtt', format: 'nlh', buyIn: 500, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    expect(usersChips()).toMatchObject({ A: 4500, B: 4500 });

    const cancelled = tm.cancel(created.id);
    if ('error' in cancelled) throw new Error(cancelled.error);
    expect(cancelled.status).toBe('cancelled');
    expect(usersChips()).toMatchObject({ A: 5000, B: 5000 });
  });

  it('поздняя регистрация закрыта вне окна lateRegMinutes', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'No Late Reg', type: 'mtt', format: 'nlh', buyIn: 500, startingStack: 1000,
        tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10, lateRegMinutes: 0,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    const started = tm.forceStart(created.id);
    if ('error' in started) throw new Error(started.error);

    // lateRegMinutes=0 — окно уже закрыто сразу после старта.
    expect(tm.register(created.id, 'C', 'Carol')).toEqual({ error: 'late-reg-closed' });
    expect(usersChips()).toMatchObject({ C: 5000 }); // не дебетован
  });
});

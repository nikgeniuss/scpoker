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

  it('поздняя регистрация в неровный сплит реально стартует раздачу (живой прогон нашёл баг 2026-06-23)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Odd Split MTT', type: 'mtt', format: 'nlh', buyIn: 100, startingStack: 2000,
        tableSize: 2, blindSpeed: 'hyper', levelUpMinutes: 10, lateRegMinutes: 10,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    // 3 регистранта → ceil(3/2)=2 стола, размеры [2,1] — один стол стартует с 1 игроком
    // и остаётся status='waiting' (startGame внутри startMtt не дотягивает players.size<2).
    ['A', 'B', 'C'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    const lonelyTableId = started.tableIds.find(
      (tid) => started.entries.filter((e) => e.tableId === tid).length === 1,
    )!;
    expect(gm.getGameState(lonelyTableId)).toMatchObject({ phase: 'waiting' });

    // Поздняя регистрация D заполняет именно этот стол — раздача должна реально начаться.
    const lateReg = tm.register(id, 'D', 'D');
    if ('error' in lateReg) throw new Error(lateReg.error);
    const dEntry = lateReg.entries.find((e) => e.userId === 'D')!;
    expect(dEntry.tableId).toBe(lonelyTableId);
    expect(gm.getGameState(lonelyTableId)).toMatchObject({ phase: 'preflop' });
  });

  it('payoutMode=fixed: строго N призовых мест независимо от числа участников (ITM% игнорируется)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Fixed Payout MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10,
        payoutMode: 'fixed', fixedPayoutPlaces: 2, itmPercent: 10, // ITM 10% от 6 дал бы 1 место — fixed=2 должен победить
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    expect(tm.get(id)!.payoutMode).toBe('fixed');
    expect(tm.get(id)!.fixedPayoutPlaces).toBe(2);

    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    let guard = 0;
    while (aliveEntries(tm, id).length > 1 && guard < 10) {
      const victim = aliveEntries(tm, id)[0];
      gm.removePlayer(victim.tableId!, victim.userId);
      guard++;
    }
    expect(guard).toBeLessThan(10);

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');

    // Строго 2 призовых места (1-е и 2-е), несмотря на то что ITM 10% от 6 участников дал бы 1.
    const paid = finished.entries.filter((e) => e.prize);
    expect(paid).toHaveLength(2);
    expect(paid.map((e) => e.finishPlace).sort()).toEqual([1, 2]);
    const total = paid.reduce((a, e) => a + (e.prize ?? 0), 0);
    expect(total).toBe(finished.prizePool);
  });

  it('гарантированный приз: бай-инов не хватает — рум доплачивает оверлей в prizePool на финише', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Guaranteed MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, guaranteedPrizePool: 10000,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    expect(tm.get(id)!.guaranteedPrizePool).toBe(10000);

    // 6 участников × 1000 = 6000 собрано — меньше гарантии 10000.
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    expect(tm.get(id)!.prizePool).toBe(6000);

    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    let guard = 0;
    while (aliveEntries(tm, id).length > 1 && guard < 10) {
      const victim = aliveEntries(tm, id)[0];
      gm.removePlayer(victim.tableId!, victim.userId);
      guard++;
    }
    expect(guard).toBeLessThan(10);

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    expect(finished.overlayPaid).toBe(4000);
    expect(finished.prizePool).toBe(10000);

    const winner = finished.entries.find((e) => e.finishPlace === 1)!;
    expect(winner.prize).toBe(10000); // ITM 15% от 6 → 1 место, весь (доплаченный) фонд победителю
  });

  it('гарантированный приз: бай-инов достаточно — оверлей не платится', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Guaranteed MTT Met', type: 'mtt', format: 'nlh', buyIn: 3000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, guaranteedPrizePool: 10000,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    // 6 участников × 3000 = 18000 — уже больше гарантии 10000.
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    let guard = 0;
    while (aliveEntries(tm, id).length > 1 && guard < 10) {
      const victim = aliveEntries(tm, id)[0];
      gm.removePlayer(victim.tableId!, victim.userId);
      guard++;
    }
    expect(guard).toBeLessThan(10);

    const finished = tm.get(id)!;
    expect(finished.overlayPaid).toBeUndefined();
    expect(finished.prizePool).toBe(18000);
  });

  it('ре-энтри после баста: новая отдельная запись, призовой фонд растёт, банкролл дебетуется повторно', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Reentry MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 10,
        reEntryEnabled: true, maxReEntries: 1,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    expect(tm.get(id)!.reEntryEnabled).toBe(true);
    expect(tm.get(id)!.maxReEntries).toBe(1);

    ['A', 'B', 'C'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    expect(started.tableIds).toHaveLength(1); // ceil(3/3)=1 стол

    const tableId = started.tableIds[0];
    gm.removePlayer(tableId, 'A'); // A форфейтит — первый бaст
    const afterBust = tm.get(id)!;
    const aOld = afterBust.entries.find((e) => e.userId === 'A')!;
    expect(aOld.status).toBe('eliminated');
    expect(aOld.finishPlace).toBe(3); // 3 игрока играли в момент баста

    const reentered = tm.register(id, 'A', 'A');
    if ('error' in reentered) throw new Error(reentered.error);
    expect(reentered.prizePool).toBe(4000); // 3 исходных входа + 1 ре-энтри
    const aEntries = reentered.entries.filter((e) => e.userId === 'A');
    expect(aEntries).toHaveLength(2); // старая eliminated + новая playing
    expect(aEntries.filter((e) => e.status === 'playing')).toHaveLength(1);
    expect(aEntries.find((e) => e.status === 'eliminated')!.finishPlace).toBe(3); // не тронута

    // Банкролл: A дебетован дважды (исходный вход + ре-энтри), старт=5000.
    expect(usersChips()).toMatchObject({ A: 5000 - 1000 - 1000 });
  });

  it('ре-энтри запрещён без reEntryEnabled', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'No Reentry MTT', type: 'mtt', format: 'nlh', buyIn: 500, startingStack: 1000,
        tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 10,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    expect(tm.get(id)!.reEntryEnabled).toBe(false);

    ['A', 'B', 'C'].forEach((u) => tm.register(id, u, u));
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    gm.removePlayer(started.tableIds[0], 'A');
    expect(tm.register(id, 'A', 'A')).toEqual({ error: 'reentry-disabled' });
  });

  it('лимит ре-энтри исчерпан блокирует следующий вход; повторный бaст после ре-энтри попадает в НОВУЮ запись', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Limited Reentry MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 10,
        reEntryEnabled: true, maxReEntries: 1, payoutMode: 'fixed', fixedPayoutPlaces: 1,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    ['A', 'B', 'C'].forEach((u) => tm.register(id, u, u));
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    const tableId = started.tableIds[0];

    gm.removePlayer(tableId, 'A'); // 1-й бaст A
    const reentered = tm.register(id, 'A', 'A');
    if ('error' in reentered) throw new Error(reentered.error);

    // 2-й бaст A — handleBust ДОЛЖЕН найти новую (playing) запись, а не старую (eliminated).
    // Без фикса (entries.find без фильтра по status) бaст бы тихо проигнорировался.
    gm.removePlayer(tableId, 'A');
    const afterSecondBust = tm.get(id)!;
    const aEntries = afterSecondBust.entries.filter((e) => e.userId === 'A');
    expect(aEntries).toHaveLength(2);
    expect(aEntries.every((e) => e.status === 'eliminated')).toBe(true);
    expect(aEntries.every((e) => e.finishPlace === 3)).toBe(true); // оба раза бaстовал при 3 живых

    // Лимит (maxReEntries=1) исчерпан — 3-й вход блокируется.
    expect(tm.register(id, 'A', 'A')).toEqual({ error: 'reentry-limit-reached' });

    // Доводим до финиша: остались B, C.
    gm.removePlayer(tableId, 'B');
    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    const winner = finished.entries.find((e) => e.finishPlace === 1)!;
    expect(winner.userId).toBe('C');

    // 4 входа всего (A×2, B, C) → prizePool=4000; fixedPayoutPlaces=1 — весь банк победителю.
    expect(finished.prizePool).toBe(4000);
    expect(winner.prize).toBe(4000);
    expect(finished.entries.filter((e) => e.prize)).toHaveLength(1);
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

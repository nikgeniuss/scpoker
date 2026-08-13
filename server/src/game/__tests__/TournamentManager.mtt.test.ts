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

  it('принудительная отмена УЖЕ ЗАПУЩЕННОГО турнира: возврат бай-инов всем entries (включая выбывших), столы закрываются', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Abort Running MTT', type: 'mtt', format: 'nlh', buyIn: 500, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    ['A', 'B', 'C'].forEach((u) => tm.register(id, u, u));
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    expect(started.status).toBe('running');
    // Рассадка по столам случайна (Fisher-Yates в startMtt) — берём РЕАЛЬНЫЙ стол A, а не tableIds[0].
    const tableId = started.entries.find((e) => e.userId === 'A')!.tableId!;

    // A уже выбыл до аборта — при void-турнире всё равно возвращаем бай-ин (турнир аннулирован целиком).
    gm.removePlayer(tableId, 'A');
    expect(tm.get(id)!.entries.find((e) => e.userId === 'A')!.status).toBe('eliminated');
    expect(usersChips()).toMatchObject({ A: 4500, B: 4500, C: 4500 });

    const aborted = tm.cancel(id);
    if ('error' in aborted) throw new Error(aborted.error);
    expect(aborted.status).toBe('cancelled');
    expect(aborted.tableIds).toHaveLength(0);
    expect(usersChips()).toMatchObject({ A: 5000, B: 5000, C: 5000 });
    // Стол реально закрыт в GameManager.
    expect(gm.getGameState(tableId)).toBeNull();
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

  it('payoutCurveExponent: top-heavy (>1) даёт 1-му месту больше, чем дефолтная гармоническая кривая', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Top Heavy MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, itmPercent: 50, payoutCurveExponent: 3,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    expect(created.payoutCurveExponent).toBe(3);
    const id = created.id;

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
    const winner = finished.entries.find((e) => e.finishPlace === 1)!;
    const harmonic = computeMttPayout(finished.prizePool, 6, 50);
    // top-heavy (exponent=3) даёт 1-му месту заметно больше доли, чем гармоническая кривая (exponent=1).
    expect(winner.prize!).toBeGreaterThan(harmonic[1]);
    const total = finished.entries.reduce((a, e) => a + (e.prize ?? 0), 0);
    expect(total).toBe(finished.prizePool); // без потерь на округлении
  });

  it('itmPercent/payoutCurveExponent вне диапазона — отказ создания', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const base = { name: 'Bad Params', type: 'mtt' as const, format: 'nlh' as const, buyIn: 1000, startingStack: 1000, tableSize: 2, blindSpeed: 'turbo' as const, levelUpMinutes: 10 };
    expect(tm.create({ ...base, itmPercent: 0 }, 'admin1')).toEqual({ error: 'invalid-itm-percent' });
    expect(tm.create({ ...base, itmPercent: 101 }, 'admin1')).toEqual({ error: 'invalid-itm-percent' });
    expect(tm.create({ ...base, itmPercent: 33.5 }, 'admin1')).toEqual({ error: 'invalid-itm-percent' });
    expect(tm.create({ ...base, payoutCurveExponent: 0.05 }, 'admin1')).toEqual({ error: 'invalid-payout-curve-exponent' });
    expect(tm.create({ ...base, payoutCurveExponent: 6 }, 'admin1')).toEqual({ error: 'invalid-payout-curve-exponent' });
    // 33% — раньше был вне жёсткого списка [10,12,15,20], теперь допустим (свободный диапазон 1-100).
    expect(tm.create({ ...base, itmPercent: 33 }, 'admin1')).not.toHaveProperty('error');
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
    const { gm, io } = await createTestGameManager();
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
    const sockA = io.addSocket('A', 'A');
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    expect(started.tableIds).toHaveLength(1); // ceil(3/3)=1 стол

    const tableId = started.tableIds[0];
    gm.removePlayer(tableId, 'A'); // A форфейтит — первый бaст
    const afterBust = tm.get(id)!;
    const aOld = afterBust.entries.find((e) => e.userId === 'A')!;
    expect(aOld.status).toBe('eliminated');
    expect(aOld.finishPlace).toBe(3); // 3 игрока играли в момент баста

    // Уведомление о вылете предлагает зайти заново ПРЯМО СЕЙЧАС (окно позднего рега открыто,
    // лимит не исчерпан) — как в PokerStars/GGPoker, см. GameManager.notifyTournamentResult.
    const bustResult = sockA.emitted.find((e) => e.event === 'tournamentResult')?.payload as { reEntryFee?: number };
    expect(bustResult.reEntryFee).toBe(1000); // = buyIn (reEntryFee не задан отдельно)

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
    const { gm, io } = await createTestGameManager();
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
    const sockA = io.addSocket('A', 'A');
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    gm.removePlayer(started.tableIds[0], 'A');
    expect(tm.register(id, 'A', 'A')).toEqual({ error: 'reentry-disabled' });

    // Уведомление о вылете НЕ предлагает ре-энтри — фича выключена для этого турнира.
    const bustResult = sockA.emitted.find((e) => e.event === 'tournamentResult')?.payload as { reEntryFee?: number };
    expect(bustResult.reEntryFee).toBeUndefined();
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

  it('бесплатный вход (buyIn=0) + платное ре-энтри по отдельной цене reEntryFee', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Free Entry MTT', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 1000,
        tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 15,
        reEntryEnabled: true, maxReEntries: 2, reEntryFee: 100,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    expect(tm.get(id)!.buyIn).toBe(0);
    expect(tm.get(id)!.reEntryFee).toBe(100);

    // Вход бесплатный — банкролл не дебетуется, prizePool не растёт.
    ['A', 'B', 'C'].forEach((u) => {
      const r = tm.register(id, u, u);
      if ('error' in r) throw new Error(r.error);
    });
    expect(tm.get(id)!.prizePool).toBe(0);
    expect(usersChips()).toMatchObject({ A: 5000, B: 5000, C: 5000 });

    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    const tableId = started.tableIds[0];

    // Ре-энтри после баста — стоит reEntryFee (100), не buyIn (0).
    gm.removePlayer(tableId, 'A');
    const reentered = tm.register(id, 'A', 'A');
    if ('error' in reentered) throw new Error(reentered.error);
    expect(reentered.prizePool).toBe(100);
    expect(usersChips()).toMatchObject({ A: 5000 - 100 });
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

  it('getStandings: null до старта и после финиша, живой рэнкинг по фишкам + payout-превью во время running', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      {
        name: 'Standings MTT', type: 'mtt', format: 'nlh', buyIn: 1000, startingStack: 1000,
        tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 20, itmPercent: 100,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    // До старта — нет ни одного живого стола, standings недоступны.
    ['A', 'B', 'C', 'D'].forEach((u) => { const r = tm.register(id, u, u); if ('error' in r) throw new Error(r.error); });
    expect(tm.getStandings(id)).toBeNull();

    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);

    const standings = tm.getStandings(id)!;
    expect(standings).not.toBeNull();
    expect(standings.totalEntries).toBe(4);
    expect(standings.playersRemaining).toBe(4);
    expect(standings.prizePool).toBe(4000);
    expect(standings.entries).toHaveLength(4);
    // Стартовый стек 1000, но блайнды+анте уже списаны на старте (heads-up на каждом из 2 столов) —
    // стеки НЕ ровно 1000, но каждый положителен и меньше стартового.
    expect(standings.entries.every((e) => e.chips > 0 && e.chips < 1000)).toBe(true);
    // Отсортировано по убыванию фишек, места 1..4 по порядку.
    expect(standings.entries.map((e) => e.place)).toEqual([1, 2, 3, 4]);
    expect(standings.entries.map((e) => e.chips)).toEqual([...standings.entries.map((e) => e.chips)].sort((a, b) => b - a));
    // itmPercent=100 → все 4 места платят.
    expect(standings.paidPlaces).toBe(4);
    expect(Object.values(standings.payout).reduce((a, b) => a + b, 0)).toBe(4000);
    // lateRegMinutes=20 → окно ещё открыто на момент старта.
    expect(standings.lateRegClosesAt).toBe(tm.get(id)!.startedAt! + 20 * 60_000);

    // Форфейт до финиша (остался 1) — после finished снова null.
    let guard = 0;
    while (aliveEntries(tm, id).length > 1 && guard < 10) {
      const victim = aliveEntries(tm, id)[0];
      gm.removePlayer(victim.tableId!, victim.userId);
      guard++;
    }
    expect(tm.get(id)!.status).toBe('finished');
    expect(tm.getStandings(id)).toBeNull();
  });
});

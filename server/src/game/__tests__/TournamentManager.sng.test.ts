import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, type GameManagerLike } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { card, buildDeck } from './helpers/cards.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import { computeSngPayout } from '../tournament/tournamentPayout.js';
import type { GameManager } from '../GameManager.js';

// Полный цикл SNG: регистрация (дебет бай-ина) → старт (посадка турнирными фишками, не банкроллом)
// → раздача до элиминации одного из двух игроков → выплата по результату → закрытие стола.
// tableSize=3 (не 2) — чтобы регистрация ровно 2 игроков НЕ триггерила авто-старт с настоящим
// шафлом (register() стартует только когда entries.length >= tableSize); старт делаем через
// forceStart(id, testDeck) с ригнутой колодой, как GameManager.startGame(roomId, testDeck) в
// остальных интеграционных тестах. Payout-проценты от tableSize=3 (бакет 65/35) — отдельно
// проверены в tournamentPayout.test.ts; здесь важна сквозная связка, не конкретный тир.

type StateView = { players: Array<{ id: string; chips: number }> };

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  const s = gm.getGameState(roomId) as unknown as StateView;
  return s.players.find((p) => p.id === userId)!.chips;
}

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

describe('TournamentManager — SNG, полный цикл', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'A', username: 'Alice', chips: 5000 }, { id: 'B', username: 'Bob', chips: 5000 }] });
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('регистрация дебетует бай-ин, старт сажает турнирными фишками, элиминация платит по результату', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      { name: 'Test SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    const regA = tm.register(id, 'A', 'Alice');
    if ('error' in regA) throw new Error(regA.error);
    expect(regA.status).toBe('registering');
    expect(regA.entries).toHaveLength(1);

    const regB = tm.register(id, 'B', 'Bob');
    if ('error' in regB) throw new Error(regB.error);
    expect(regB.status).toBe('registering'); // tableSize=3, ещё не полон — не авто-стартует
    expect(regB.entries).toHaveLength(2);
    expect(regB.prizePool).toBe(2000);

    // Бай-ин списан один раз с каждого при регистрации (банкролл — не турнирные фишки).
    expect(usersChips()).toEqual({ A: 4000, B: 4000 });

    // Повторная регистрация — идемпотентный отказ.
    expect(tm.register(id, 'A', 'Alice')).toEqual({ error: 'already-registered' });

    // Ригнутая колода: A = AA (победитель), B = KK (проигравший), нейтральный борд.
    const deck = buildDeck(
      card('A', 's'), card('A', 'h'),
      card('K', 's'), card('K', 'h'),
      card('2', 'c'),
      card('Q', 'd'), card('J', 'h'), card('7', 's'),
      card('3', 'c'), card('9', 'd'),
      card('4', 'c'), card('8', 'h'),
    );
    const started = tm.forceStart(id, deck);
    if ('error' in started) throw new Error(started.error);

    const running = tm.get(id)!;
    expect(running.status).toBe('running');
    expect(running.tableIds).toHaveLength(1);
    const roomId = running.tableIds[0];
    expect(running.entries.every((e) => e.status === 'playing')).toBe(true);

    // Турнирные фишки НЕ из банкролла — банкролл не двигается при посадке за стол.
    expect(usersChips()).toEqual({ A: 4000, B: 4000 });

    // Heads-up: B=D+SB первый, A=BB. Оба all-in префлоп → run-out до шоудауна.
    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    // Пот распределён сразу на showdown (до cleanupHand) — A выиграл весь стек.
    expect(chipsOf(gm, roomId, 'A')).toBe(2000);
    expect(chipsOf(gm, roomId, 'B')).toBe(0);

    // Окно шоудауна (5с) — после него cleanupHand → autoLeaveBrokePlayers → onTournamentBust → finish().
    vi.advanceTimersByTime(6000);

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toBeTypeOf('number');

    const a = finished.entries.find((e) => e.userId === 'A')!;
    const b = finished.entries.find((e) => e.userId === 'B')!;
    expect(a.finishPlace).toBe(1);
    expect(b.finishPlace).toBe(2);

    const payout = computeSngPayout(2000, 3);
    expect(a.prize).toBe(payout[1]);
    expect(b.prize).toBe(payout[2]);
    expect(a.prize! + b.prize!).toBe(2000); // весь призовой фонд распределён, без потерь

    // Призовые кредитованы в банкролл ровно один раз поверх уже дебетованного бай-ина.
    expect(usersChips()).toEqual({ A: 4000 + a.prize!, B: 4000 + b.prize! });

    // Стол закрыт — комната больше не существует.
    expect(gm.getGameState(roomId)).toBeNull();
  });

  it('отмена в registering возвращает бай-ин всем зарегистрированным', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Cancel Me', type: 'sng', format: 'nlh', buyIn: 500, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    expect(usersChips()).toEqual({ A: 4500, B: 4500 });

    const cancelled = tm.cancel(created.id);
    if ('error' in cancelled) throw new Error(cancelled.error);
    expect(cancelled.status).toBe('cancelled');
    expect(usersChips()).toEqual({ A: 5000, B: 5000 });
  });

  it('недостаточно банкролла на бай-ин — отказ без списания', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Big Buyin', type: 'sng', format: 'nlh', buyIn: 10_000, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    expect(tm.register(created.id, 'A', 'Alice')).toEqual({ error: 'insufficient-bankroll' });
    expect(usersChips()).toEqual({ A: 5000, B: 5000 });
  });

  it('добровольный leaveRoom на турнирном столе — форфейт, НЕ кэш-аут (банкролл не растёт)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'Forfeit Test', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    const started = tm.forceStart(created.id);
    if ('error' in started) throw new Error(started.error);
    const roomId = tm.get(created.id)!.tableIds[0];

    // Бай-ин дебетован при регистрации — это весь эффект на банкролл до сих пор.
    expect(usersChips()).toEqual({ A: 4000, B: 4000 });

    // B жмёт «Выйти» (leaveRoom) посреди турнира со стеком 1000 на руках. Только 2 игрока
    // зарегистрированы (tableSize=3 пуст наполовину) — выход B оставляет A в одиночестве,
    // турнир завершается синхронно внутри этого вызова (onTournamentBust → finish()).
    gm.removePlayer(roomId, 'B');

    const finished = tm.get(created.id)!;
    expect(finished.status).toBe('finished'); // остался один игрок (A) — турнир завершён
    const b = finished.entries.find((e) => e.userId === 'B')!;
    expect(b.finishPlace).toBe(2);
    const a = finished.entries.find((e) => e.userId === 'A')!;
    expect(a.finishPlace).toBe(1);
    expect(a.prize).toBeGreaterThan(0);
    expect(b.prize).toBeGreaterThan(0); // tableSize=3 → бакет top-2 (65/35), 2-е место тоже платит

    // Призовые кредитованы поверх дебетованного бай-ина каждому по своему месту.
    expect(usersChips()).toEqual({ A: 4000 + a.prize!, B: 4000 + b.prize! });
  });
});

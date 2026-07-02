import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { card, buildDeck } from './helpers/cards.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import { computeSngPayout } from '../tournament/tournamentPayout.js';
import type { GameManager } from '../GameManager.js';

// Баунти/PKO (ROADMAP §10.19): кэш-часть баунти жертвы должна попадать ПРЯМО в банкролл убийцы —
// сразу при элиминации, а не на турнирный стек (стек не влияет на выплату по месту в этой архитектуре,
// см. обсуждение в сессии 2026-06-28). Heads-up — достаточно для проверки математики split'а, т.к.
// бaст единственного оппонента уже даёт killerIds=[winner].

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

function riggedHeadsUpDeck() {
  // A = AA (победитель), B = KK (проигравший), нейтральный борд.
  return buildDeck(
    card('A', 's'), card('A', 'h'),
    card('K', 's'), card('K', 'h'),
    card('2', 'c'),
    card('Q', 'd'), card('J', 'h'), card('7', 's'),
    card('3', 'c'), card('9', 'd'),
    card('4', 'c'), card('8', 'h'),
  );
}

describe('TournamentManager — баунти/PKO', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'A', username: 'Alice', chips: 5000 }, { id: 'B', username: 'Bob', chips: 5000 }] });
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('флэт: вся «цена за голову» уходит убийце в банкролл сразу при элиминации', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Bounty Flat', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3,
        blindSpeed: 'turbo', levelUpMinutes: 10, bountyEnabled: true, bountyType: 'flat', bountyPercent: 50,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    tm.register(id, 'A', 'Alice');
    const regB = tm.register(id, 'B', 'Bob');
    if ('error' in regB) throw new Error(regB.error);

    // 1000 бай-ин, 50% в баунти-пул → 500 баунти на голову, 500 в призовой фонд за каждый вход.
    const a0 = regB.entries.find((e) => e.userId === 'A')!;
    const b0 = regB.entries.find((e) => e.userId === 'B')!;
    expect(a0.bounty).toBe(500);
    expect(b0.bounty).toBe(500);
    expect(regB.prizePool).toBe(1000); // (1000-500)*2

    const started = tm.forceStart(id, riggedHeadsUpDeck());
    if ('error' in started) throw new Error(started.error);
    const roomId = tm.get(id)!.tableIds[0];

    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');

    // Баунти-кэш должен прийти в банкролл СРАЗУ при бaсте (cleanupHand после окна шоудауна),
    // ДО того как турнир успеет завершиться и выплатить призовые по месту.
    vi.advanceTimersByTime(6000);

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    const a = finished.entries.find((e) => e.userId === 'A')!;
    const b = finished.entries.find((e) => e.userId === 'B')!;

    expect(b.bounty).toBe(0); // отдано убийце
    expect(a.bountyWon).toBe(500); // флэт — весь баунти кэшем, ничего не растёт
    expect(a.bounty).toBe(500); // собственный баунти A не изменился (флэт, не progressive)

    const payout = computeSngPayout(1000, 3);
    expect(a.prize).toBe(payout[1]);
    expect(b.prize).toBe(payout[2]);

    // Банкролл: бай-ин(-1000) при регистрации, у A дополнительно +500 баунти-кэш +приз за место.
    expect(usersChips()).toEqual({
      A: 5000 - 1000 + 500 + a.prize!,
      B: 5000 - 1000 + b.prize!,
    });
  });

  it('progressive (PKO): половина баунти кэшем убийце, половина — в его собственный баунти', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Bounty PKO', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3,
        blindSpeed: 'turbo', levelUpMinutes: 10, bountyEnabled: true, bountyType: 'progressive', bountyPercent: 50,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;

    tm.register(id, 'A', 'Alice');
    tm.register(id, 'B', 'Bob');

    const started = tm.forceStart(id, riggedHeadsUpDeck());
    if ('error' in started) throw new Error(started.error);
    const roomId = tm.get(id)!.tableIds[0];

    gm.handlePlayerAction(roomId, 'B', 'all-in');
    gm.handlePlayerAction(roomId, 'A', 'all-in');
    vi.advanceTimersByTime(6000);

    const finished = tm.get(id)!;
    const a = finished.entries.find((e) => e.userId === 'A')!;
    const b = finished.entries.find((e) => e.userId === 'B')!;

    expect(b.bounty).toBe(0);
    expect(a.bountyWon).toBe(250);       // половина кэшем
    expect(a.bounty).toBe(500 + 250);    // стартовые 500 + прирост от убийства (растёт по ходу турнира)

    expect(usersChips()).toEqual({
      A: 5000 - 1000 + 250 + a.prize!,
      B: 5000 - 1000 + b.prize!,
    });
  });

  it('форфейт (добровольный выход) — баунти жертвы сгорает, никому не платится', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    const created = tm.create(
      {
        name: 'Bounty Forfeit', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3,
        blindSpeed: 'turbo', levelUpMinutes: 10, bountyEnabled: true, bountyType: 'flat', bountyPercent: 50,
      },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const id = created.id;
    tm.register(id, 'A', 'Alice');
    tm.register(id, 'B', 'Bob');
    const started = tm.forceStart(id);
    if ('error' in started) throw new Error(started.error);
    const roomId = tm.get(id)!.tableIds[0];

    gm.removePlayer(roomId, 'B'); // форфейт, не раздача — killerIds=[]

    const finished = tm.get(id)!;
    expect(finished.status).toBe('finished');
    const a = finished.entries.find((e) => e.userId === 'A')!;
    expect(a.bountyWon ?? 0).toBe(0); // никто не выигрывал раздачу — баунти не начислено
  });

  it('бай-ин без баунти (bountyEnabled=false) — поведение прежнее, поля не выставляются', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'No Bounty', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 3, blindSpeed: 'turbo', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    const regB = tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    if ('error' in regB) throw new Error(regB.error);
    expect(regB.entries[0].bounty).toBeUndefined();
    expect(regB.prizePool).toBe(2000); // полный бай-ин x2 в призовой фонд, как раньше
  });
});

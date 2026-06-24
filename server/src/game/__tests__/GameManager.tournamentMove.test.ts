import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import type { GameManager } from '../GameManager.js';

// movePlayerToTable/isTableSafeToRebalance (MTT-балансировка, ROADMAP §10.19) — мощность переноса
// игрока между турнирными столами без участия банкролла, и гард «не трогать стол мид-хэнд».
type StateView = { players: Array<{ id: string; position: number; chips: number; disconnected?: boolean }> };

describe('GameManager — movePlayerToTable / isTableSafeToRebalance', () => {
  beforeEach(() => {
    resetStorage({ users: [{ id: 'A', username: 'Alice', chips: 5000 }, { id: 'B', username: 'Bob', chips: 5000 }] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('переносит игрока между турнирными столами между раздачами (status=waiting)', async () => {
    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;

    const tableA = realGm.createTournamentTable({ tournamentId: 't1', name: 'A', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    const tableB = realGm.createTournamentTable({ tournamentId: 't1', name: 'B', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    realGm.seatTournamentPlayer(tableA, 'A', 'Alice', 1000);
    realGm.seatTournamentPlayer(tableB, 'B', 'Bob', 1000);

    // Ни одной раздачи не было (startGame не звали) — оба стола безопасны для переноса.
    expect(realGm.isTableSafeToRebalance(tableA)).toBe(true);
    expect(realGm.isTableSafeToRebalance(tableB)).toBe(true);

    expect(realGm.movePlayerToTable(tableA, tableB, 'A')).toBe(true);

    const stateA = gm.getGameState(tableA) as unknown as StateView;
    const stateB = gm.getGameState(tableB) as unknown as StateView;
    expect(stateA.players).toHaveLength(0);
    expect(stateB.players.map((p) => p.id).sort()).toEqual(['A', 'B']);
    // Стек переехал как есть, банкролл не тронут (несвязанная сущность — турнирные фишки).
    expect(stateB.players.find((p) => p.id === 'A')!.chips).toBe(1000);

    const users = (await import('./helpers/storage.js')).getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(Object.fromEntries(users.map((u) => [u.id, u.chips]))).toEqual({ A: 5000, B: 5000 });
  });

  it('блокирует перенос ИЗ стола, на котором идёт раздача (status=playing)', async () => {
    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;

    const tableA = realGm.createTournamentTable({ tournamentId: 't1', name: 'A', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    const tableB = realGm.createTournamentTable({ tournamentId: 't1', name: 'B', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    realGm.seatTournamentPlayer(tableA, 'A', 'Alice', 1000);
    realGm.seatTournamentPlayer(tableA, 'B', 'Bob', 1000);
    gm.startGame(tableA); // раздача стартовала — стол теперь mid-hand

    expect(realGm.isTableSafeToRebalance(tableA)).toBe(false);
    expect(realGm.movePlayerToTable(tableA, tableB, 'A')).toBe(false);

    const stateA = gm.getGameState(tableA) as unknown as StateView;
    expect(stateA.players).toHaveLength(2); // никто не сдвинулся
  });

  it('не переносит, если на целевом столе нет мест', async () => {
    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;

    const tableA = realGm.createTournamentTable({ tournamentId: 't1', name: 'A', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    const tableB = realGm.createTournamentTable({ tournamentId: 't1', name: 'B', maxPlayers: 1, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    realGm.seatTournamentPlayer(tableA, 'A', 'Alice', 1000);
    realGm.seatTournamentPlayer(tableB, 'B', 'Bob', 1000); // tableB уже полон (maxPlayers=1)

    expect(realGm.movePlayerToTable(tableA, tableB, 'A')).toBe(false);
  });

  it('дисконнект на турнирном столе в waiting — сит-аут, НЕ форфейт (живой прогон нашёл баг 2026-06-23)', async () => {
    const { gm } = await createTestGameManager();
    const realGm = gm as unknown as GameManager;

    // Неровный сплит MTT: стол с 1 игроком, ждём второго (status остаётся 'waiting').
    const tableA = realGm.createTournamentTable({ tournamentId: 't1', name: 'A', maxPlayers: 2, smallBlind: 10, bigBlind: 20, format: 'nlh' });
    realGm.seatTournamentPlayer(tableA, 'A', 'Alice', 1000);

    realGm.handleDisconnect('A');

    // Игрок должен остаться за столом сит-аутом, а не быть удалён форфейтом.
    const stateA = gm.getGameState(tableA) as unknown as StateView;
    expect(stateA.players).toHaveLength(1);
    expect(stateA.players[0].id).toBe('A');
    expect(stateA.players[0].disconnected).toBe(true);
  });
});

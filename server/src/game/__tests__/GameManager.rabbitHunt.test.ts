import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';

// Rabbit Hunting (ROADMAP §10.12, платная фича): если рука кончилась раньше ривера — за плату
// видно карты, которые пришли бы. Окно — пока phase==='showdown' (до cleanupHand, 5с). Цена
// настраивается в админке (paidFeatures.rabbitHunt); оплата идёт из стека и логируется как
// rake-like запись в statsRecorder (видно в админ-вкладке «Данные»).

const SB = 50;
const BB = 100;

type RabbitHuntState = {
  phase: string;
  bigBlind: number;
  rabbitHunt?: { price: number; revealed: unknown[] | null };
  players: Array<{ id: string; chips: number }>;
};

type GM = GameManagerLike & {
  requestRabbitHunt(roomId: string, userId: string): void;
  statsRecorder?: (rec: { t: number; roomId: string; userId: string; delta: number; rake: number; format?: string }) => void;
};

function getState(gm: GameManagerLike, roomId: string, viewerId?: string): RabbitHuntState {
  return gm.getGameState(roomId, viewerId) as unknown as RabbitHuntState;
}

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  return getState(gm, roomId).players.find((p) => p.id === userId)!.chips;
}

async function setupHeadsUp(rabbitHunt: { enabled: boolean; mode: 'fixed' | 'percent'; fixedAmount: number; percent: number }) {
  resetStorage({ settings: { paidFeatures: { rabbitHunt } } });
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'RabbitRoom', smallBlind: SB, bigBlind: BB, maxPlayers: 9, turnDurationSec: 30, buyInMinBb: 5, buyInMaxBb: 100 },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  seatPlayer(gm, io, { roomId, userId: 'A', username: 'Alice', bankroll: 10_000, buyIn: 1000 });
  seatPlayer(gm, io, { roomId, userId: 'B', username: 'Bob', bankroll: 10_000, buyIn: 1000 });
  return { gm: gm as GM, roomId };
}

describe('GameManager — Rabbit Hunting (§10.12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('фолд префлоп: rabbitHunt доступен с ценой, карты скрыты до оплаты (приватно per-viewer)', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold'); // Bob (SB) фолдит — Alice забирает банк без вскрытия

    expect(getState(gm, roomId, 'A').rabbitHunt).toEqual({ price: 50, revealed: null });
    expect(getState(gm, roomId, 'B').rabbitHunt).toEqual({ price: 50, revealed: null });
    // Без viewerId (например, лобби-вьюшка) — тоже не раскрыто.
    expect(getState(gm, roomId).rabbitHunt).toEqual({ price: 50, revealed: null });
  });

  it('оплата: списывает со стека, раскрывает ТОЛЬКО оплатившему, лог идёт в statsRecorder как rake', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 });
    const captured: Array<{ userId: string; delta: number; rake: number }> = [];
    gm.statsRecorder = (rec) => captured.push(rec);

    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold');
    const chipsBefore = chipsOf(gm, roomId, 'A');

    gm.requestRabbitHunt(roomId, 'A');

    expect(chipsOf(gm, roomId, 'A')).toBe(chipsBefore - 50);
    const aView = getState(gm, roomId, 'A').rabbitHunt;
    expect(aView?.revealed).not.toBeNull();
    expect(aView?.revealed).toHaveLength(5); // префлоп-фолд → флоп+тёрн+ривер = 5 карт
    // Bob не платил — ему по-прежнему не видно.
    expect(getState(gm, roomId, 'B').rabbitHunt?.revealed).toBeNull();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ userId: 'A', delta: -50, rake: 50, roomId });
  });

  it('повторный запрос — идемпотентно, без повторного списания', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold');

    gm.requestRabbitHunt(roomId, 'A');
    const chipsAfterFirst = chipsOf(gm, roomId, 'A');
    gm.requestRabbitHunt(roomId, 'A');

    expect(chipsOf(gm, roomId, 'A')).toBe(chipsAfterFirst);
  });

  it('не хватает стека — запрос отклоняется, карты не раскрываются', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 2000, percent: 5 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold');
    const chipsBefore = chipsOf(gm, roomId, 'A'); // 1000 - 100(BB) + 150(pot) = 1050 < 2000

    gm.requestRabbitHunt(roomId, 'A');

    expect(chipsOf(gm, roomId, 'A')).toBe(chipsBefore);
    expect(getState(gm, roomId, 'A').rabbitHunt?.revealed).toBeNull();
  });

  it('режим percent: цена = floor(pot * percent / 100)', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'percent', fixedAmount: 0, percent: 10 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold'); // pot = SB(50) + BB(100) = 150 → price = floor(150*10/100) = 15

    expect(getState(gm, roomId, 'A').rabbitHunt?.price).toBe(15);
  });

  it('рука дошла до ривера (борд полный 5 карт) — rabbitHunt недоступен, даже если фича включена', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 });
    gm.startGame(roomId);
    // Heads-up: на префлопе первый Bob (SB) — у него непокрытая ставка, нужен 'call', не 'check'.
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check'); // BB-опция закрывает префлоп
    // Постфлоп первый ходит BB (Alice) — dealerIndex+1.
    for (const _street of ['flop', 'turn', 'river']) {
      gm.handlePlayerAction(roomId, 'A', 'check');
      gm.handlePlayerAction(roomId, 'B', 'check');
    }
    expect(getState(gm, roomId, 'A').phase).toBe('showdown');
    expect(getState(gm, roomId, 'A').rabbitHunt).toBeUndefined();
  });

  it('фича выключена в настройках — rabbitHunt не появляется', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: false, mode: 'fixed', fixedAmount: 50, percent: 5 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold');

    expect(getState(gm, roomId, 'A').rabbitHunt).toBeUndefined();
    gm.requestRabbitHunt(roomId, 'A'); // no-op, не должно бросать
    expect(getState(gm, roomId, 'A').rabbitHunt).toBeUndefined();
  });

  it('после cleanupHand (5с) окно закрывается — запрос больше не проходит', async () => {
    const { gm, roomId } = await setupHeadsUp({ enabled: true, mode: 'fixed', fixedAmount: 50, percent: 5 });
    gm.startGame(roomId);
    gm.handlePlayerAction(roomId, 'B', 'fold');
    expect(getState(gm, roomId, 'A').rabbitHunt).toBeDefined();

    vi.advanceTimersByTime(5000); // cleanupHand сбрасывает поля

    expect(getState(gm, roomId, 'A').rabbitHunt).toBeUndefined();
    const chipsBefore = chipsOf(gm, roomId, 'A');
    gm.requestRabbitHunt(roomId, 'A');
    expect(chipsOf(gm, roomId, 'A')).toBe(chipsBefore); // окно закрыто — без эффекта
  });
});

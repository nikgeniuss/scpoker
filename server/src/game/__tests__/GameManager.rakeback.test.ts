import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { setStorage } from './helpers/storage.js';
import { getUserRakebackInfo } from '../rakebackService.js';
import { getBalance as getWalletBalance } from '../rewardsWalletService.js';
import { getNotifications } from '../inboxService.js';
import { card, buildDeck } from './helpers/cards.js';

// Интеграционные тесты рейкбэка — врезка в GameManager.cleanupHand (после showdown-рейка).
// Чистая логика тиров/начисления уже покрыта rakebackService.test.ts; здесь проверяем всю
// цепочку на реальной раздаче: реальный рейк с банка → applyRakeback → тихое начисление HUB-
// коинов в rewardsWalletService (НЕ в стек — рейкбэк больше не выводится в USDT, решение
// пользователя 2026-08-30, ROADMAP §10.21.8). БЕЗ уведомления во «Входящие» — на раскачанном
// столе рейк капает почти на каждой раздаче, инбокс был бы залит спамом (2026-06-23).

const SB = 5;
const BB = 10;

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  const s = gm.getGameState(roomId) as unknown as { players: Array<{ id: string; chips: number }> };
  return s.players.find((p) => p.id === userId)!.chips;
}

function seedRakeback(enabled: boolean): void {
  setStorage('rakeback.json', {
    enabled,
    tiers: [{ name: 'Bronze', minRakeCents: 0, percent: 10 }],
    users: {},
    history: [],
  });
}

async function setupRakedTable() {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'RakebackRoom',
      smallBlind: SB,
      bigBlind: BB,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 5,
      buyInMaxBb: 100,
      rake: { percent: 10, capBb: 50 },
      autoStartPlayers: 9, // не даём cleanupHand автостартовать следующую раздачу (исказит chips новыми блайндами)
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < 2; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, io, roomId };
}

// AA (P0=A) vs KK (P1=B) на нейтральном борде — A выигрывает.
function aaVsKkDeck() {
  return buildDeck(
    card('A', 's'), card('A', 'h'),
    card('K', 's'), card('K', 'h'),
    card('2', 'c'),
    card('Q', 'd'), card('J', 'h'), card('7', 's'),
    card('3', 'c'), card('9', 'd'),
    card('4', 'c'), card('8', 'h'),
  );
}

describe('GameManager — рейкбэк (showdown-врезка)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('включённый рейкбэк начисляет % уплаченного рейка (lifetime-счётчик)', async () => {
    seedRakeback(true);
    const { gm, roomId } = await setupRakedTable();
    gm.startGame(roomId, aaVsKkDeck());
    // Heads-up: B=D=SB ходит первым. Оба чек/колл до шоудауна (банк = только блайнды = 20).
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    vi.advanceTimersByTime(5001); // cleanupHand (где начисляется рейкбэк) отложен на 5с показа шоудауна

    // pot=20, рейк=floor(20*0.1)=2 (cap 50BB не давит). Атрибуция пропорционально вкладу:
    // A вложил 10 (BB), B вложил 10 (SB+call) — commit поровну → по 1 центу рейка каждому.
    expect(getUserRakebackInfo('A').lifetimeRake).toBe(1);
    expect(getUserRakebackInfo('B').lifetimeRake).toBe(1);
  });

  it('payout>0 начисляется в HUB-коины кошелька, НЕ в стек, БЕЗ уведомления (анти-спам)', async () => {
    seedRakeback(true);
    const { gm, roomId } = await setupRakedTable();
    gm.startGame(roomId, aaVsKkDeck());
    // Рейзим, чтобы банк был крупнее и рейк дал заметный payout.
    gm.handlePlayerAction(roomId, 'B', 'raise', 200); // SB рейзит до 200
    gm.handlePlayerAction(roomId, 'A', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    vi.advanceTimersByTime(5001);

    // pot=400, рейк=floor(400*0.1)=40, cap=50*10=500 (не давит). Поровну (commit 200 each) → 20 центов рейка каждому.
    // Bronze 10% от 20 = 2 цента payout каждому.
    const rakePerPlayer = 20;
    const payout = Math.floor((rakePerPlayer * 10) / 100);
    expect(payout).toBe(2);

    const base = 1000 - 200;
    // A выиграл банк (400-40=360), B проиграл вложенные 200. Стек НЕ содержит рейкбэк-payout —
    // тот идёт в отдельный HUB-коин кошелёк, не в реальные (выводимые) чипсы.
    expect(chipsOf(gm, roomId, 'A')).toBe(base + 360);
    expect(chipsOf(gm, roomId, 'B')).toBe(base);

    expect(getUserRakebackInfo('A').totalPaid).toBe(payout);
    expect(getUserRakebackInfo('B').totalPaid).toBe(payout);
    expect(getWalletBalance('A')).toBe(payout);
    expect(getWalletBalance('B')).toBe(payout);

    // Анти-спам: начисление тихое, никакого уведомления во «Входящие» не создаётся.
    expect(getNotifications('A', 5)).toHaveLength(0);
    expect(getNotifications('B', 5)).toHaveLength(0);
  });

  it('рейкбэк выключен — рейк удерживается как обычно, но кэшбэк не начисляется', async () => {
    seedRakeback(false);
    const { gm, roomId } = await setupRakedTable();
    gm.startGame(roomId, aaVsKkDeck());
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    gm.handlePlayerAction(roomId, 'A', 'check');
    gm.handlePlayerAction(roomId, 'B', 'check');
    vi.advanceTimersByTime(5001);

    expect(chipsOf(gm, roomId, 'A')).toBe(1008); // как в GameManager.rake.test.ts (без рейкбэка)
    expect(chipsOf(gm, roomId, 'B')).toBe(990);
    expect(getUserRakebackInfo('A').lifetimeRake).toBe(0);
    expect(getWalletBalance('A')).toBe(0);
    expect(getNotifications('A', 5).some((n) => n.type === 'rakeback')).toBe(false);
  });
});

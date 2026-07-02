import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { recordHandStat, type HandStatRecord } from '../statsService.js';
import { setResponsibleGamblingLimits, getResponsibleGamblingState } from '../../auth/auth.js';
import { getNotifications } from '../inboxService.js';
import { card, buildDeck } from './helpers/cards.js';

type GM = GameManagerLike & { statsRecorder?: (rec: HandStatRecord) => void };

// Интеграционный тест лимита на потери (ROADMAP §11.2) — врезка в GameManager.cleanupHand,
// сразу после statsRecorder. Только предупреждение (раздача/выплата не блокируется),
// дедуп по periodKey — повторная раздача в том же периоде не шлёт уведомление второй раз.

const SB = 5;
const BB = 10;

// P0=A получает KK, P1=B получает AA — A проигрывает шоудаун без рейза (call-down).
function kkVsAaDeck() {
  return buildDeck(
    card('K', 's'), card('K', 'h'),
    card('A', 's'), card('A', 'h'),
    card('2', 'c'),
    card('Q', 'd'), card('J', 'h'), card('7', 's'),
    card('3', 'c'), card('9', 'd'),
    card('4', 'c'), card('8', 'h'),
  );
}

async function setupTable() {
  const { gm: gmRaw, io } = await createTestGameManager();
  const gm = gmRaw as GM;
  gm.statsRecorder = recordHandStat;
  const create = gm.createRoom(
    {
      name: 'LossLimitRoom',
      smallBlind: SB,
      bigBlind: BB,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 5,
      buyInMaxBb: 100,
      rake: { percent: 0, capBb: 0 },
      autoStartPlayers: 9,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (let i = 0; i < 2; i++) {
    const userId = String.fromCharCode(65 + i);
    seatPlayer(gm, io, { roomId, userId, username: userId + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, roomId };
}

function playCallDownHand(gm: GameManagerLike, roomId: string) {
  gm.handlePlayerAction(roomId, 'B', 'call');
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'B', 'check');
  gm.handlePlayerAction(roomId, 'A', 'check');
  gm.handlePlayerAction(roomId, 'B', 'check');
}

describe('GameManager — лимит на потери (cleanupHand)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('предупреждает ровно один раз, когда потеря за период достигает лимита', async () => {
    const { gm, roomId } = await setupTable();
    setResponsibleGamblingLimits('A', { lossLimitCents: 10, lossLimitPeriod: 'day' });

    gm.startGame(roomId, kkVsAaDeck());
    playCallDownHand(gm, roomId);
    vi.advanceTimersByTime(5001);

    // pot=20, без рейка. A (KK) проигрывает свой коммит (BB=10) → pnl=-10, lossCents=10 >= лимита 10.
    const notifs = getNotifications('A', 10);
    const rgWarnings = notifs.filter((n) => n.type === 'rg-warning');
    expect(rgWarnings).toHaveLength(1);
    expect(getResponsibleGamblingState('A').lossWarnedPeriodKey).toBeDefined();
  });

  it('не предупреждает, если лимит не задан', async () => {
    const { gm, roomId } = await setupTable();
    gm.startGame(roomId, kkVsAaDeck());
    playCallDownHand(gm, roomId);
    vi.advanceTimersByTime(5001);

    expect(getNotifications('A', 10).filter((n) => n.type === 'rg-warning')).toHaveLength(0);
  });

  it('выключенный admin-тоггл lossLimitEnabled — не предупреждает, даже если лимит задан', async () => {
    resetStorage({
      settings: {
        turnDurationMs: 30_000,
        autostartDelayMs: 10_000,
        defaultPlayerChips: 1000,
        responsibleGambling: {
          depositLimitEnabled: true,
          lossLimitEnabled: false,
          sessionTimeLimitEnabled: true,
          selfExclusionEnabled: true,
          timeoutEnabled: true,
        },
      },
    });
    const { gm, roomId } = await setupTable();
    setResponsibleGamblingLimits('A', { lossLimitCents: 10, lossLimitPeriod: 'day' });

    gm.startGame(roomId, kkVsAaDeck());
    playCallDownHand(gm, roomId);
    vi.advanceTimersByTime(5001);

    expect(getNotifications('A', 10).filter((n) => n.type === 'rg-warning')).toHaveLength(0);
  });
});

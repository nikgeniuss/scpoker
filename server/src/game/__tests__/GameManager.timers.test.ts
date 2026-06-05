import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { card, buildDeck } from './helpers/cards.js';
import type { MockIo } from './helpers/ioMock.js';

// Characterization-тесты таймеров ПЕРЕД распилом TimerService (ROADMAP §9.3-B).
// Дополняют lifecycle.test.ts (auto-fold/check, timebank Phase1-2, disconnect 30с, autostart):
// закрывают пробелы — отмена autostart при уходе игрока и отмена pending auto-fold при действии
// (защита от гонок, которая дублируется в startTurnTimer/startTimebankTimer).

const TIMEBANK_OFF = {
  enabled: false, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60, allowPerTableOverride: false,
};
const DEFAULT_BOT_MODE = {
  enabled: false, peekMode: 'river' as const, tablesPerLevel: 1, botsPerTable: 3,
  defaultBuyInBb: 100, refillIntervalMs: 120_000,
};

type StateView = {
  phase: string;
  players: Array<{ id: string; isFolded: boolean; timebank?: number }>;
  turnEndsAt: number | null;
};
const getState = (gm: GameManagerLike, roomId: string) => gm.getGameState(roomId) as unknown as StateView;

function makeDeck(playerCount: number) {
  const suits = ['s', 'h', 'd', 'c'] as const;
  const ranks: Array<'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6'> = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6'];
  const cardsList = [];
  for (let i = 0; i < playerCount; i++) cardsList.push(card(ranks[i], suits[0]), card(ranks[i], suits[1]));
  return buildDeck(...cardsList);
}

async function setupTable(over?: { turnDurationMs?: number; autostartDelayMs?: number; timebankOff?: boolean }) {
  resetStorage({
    settings: {
      turnDurationMs: over?.turnDurationMs ?? 30_000,
      autostartDelayMs: over?.autostartDelayMs ?? 10_000,
      defaultPlayerChips: 1000,
      timebank: over?.timebankOff ? TIMEBANK_OFF : { ...TIMEBANK_OFF, enabled: true },
      botMode: DEFAULT_BOT_MODE,
    },
  });
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    { name: 'TimerRoom', smallBlind: 5, bigBlind: 10, maxPlayers: 9,
      turnDurationSec: Math.round((over?.turnDurationMs ?? 30_000) / 1000), buyInMinBb: 20, buyInMaxBb: 100 },
    'system',
  );
  const roomId = (create as { roomId: string }).roomId;
  return { gm, io, roomId };
}

describe('TimerService — characterization (до распила)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('autostart-таймер', () => {
    it('взвод автостарта при 2 игроках → отмена при уходе одного (игра не стартует)', async () => {
      const { gm, io, roomId } = await setupTable({ autostartDelayMs: 10_000 });
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      // 2 игрока → автостарт взведён
      expect(gm.getCountdownEndsAt(roomId)).not.toBeNull();

      // Один уходит → автостарт должен отмениться
      gm.removePlayer(roomId, 'B');
      expect(gm.getCountdownEndsAt(roomId)).toBeNull();

      // Прокручиваем за пределы задержки — игра НЕ должна стартовать
      vi.advanceTimersByTime(10_001);
      expect(getState(gm, roomId).phase).toBe('waiting');
    });
  });

  describe('отмена pending auto-fold при действии (race-guard)', () => {
    it('игрок успел call до тайм-аута → не получает auto-fold от устаревшего таймера', async () => {
      // timebank выключен — единственная фаза turn-таймера, чище проверка
      const { gm, io, roomId } = await setupTable({ turnDurationMs: 30_000, timebankOff: true });
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));

      // Heads-up: дилер=SB=B ходит первым префлоп. B raise → A под call>0 (auto-fold-кандидат).
      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      // A действует ДО тайм-аута
      gm.handlePlayerAction(roomId, 'A', 'call');

      // Прокручиваем заметно дольше длительности хода — устаревший таймер A не должен его сфолдить
      vi.advanceTimersByTime(60_001);
      const s = getState(gm, roomId);
      expect(s.players.find((p) => p.id === 'A')!.isFolded).toBe(false);
      expect(s.players.find((p) => p.id === 'B')!.isFolded).toBe(false);
    });

    it('действие в фазе таймбанка снимает оба таймера (нет auto-fold после)', async () => {
      const { gm, io, roomId } = await setupTable({ turnDurationMs: 5_000 }); // timebank enabled (30с)
      seatPlayer(gm, io, { roomId, userId: 'A', username: 'A', bankroll: 10_000, buyIn: 1000 });
      seatPlayer(gm, io, { roomId, userId: 'B', username: 'B', bankroll: 10_000, buyIn: 1000 });
      gm.startGame(roomId, makeDeck(2));

      gm.handlePlayerAction(roomId, 'B', 'raise', 30);
      // Phase 1 (5с) истекает → engage timebank Phase 2
      vi.advanceTimersByTime(5_001);
      expect(getState(gm, roomId).turnEndsAt).toBeNull();
      // A действует в Phase 2 (call)
      gm.handlePlayerAction(roomId, 'A', 'call');

      // Прокручиваем сверх таймбанка — A не должен получить auto-fold
      vi.advanceTimersByTime(60_001);
      expect(getState(gm, roomId).players.find((p) => p.id === 'A')!.isFolded).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { makeRoom } from '../roomFactory.js';
import { createPlayer } from '../playerFactory.js';
import { serializeActiveHand, applyActiveHandSnapshot } from '../activeHandPersistence.js';
import { card } from './helpers/cards.js';

const TIMEBANK = { enabled: true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60 };
const RAKE = { percent: 0, capBb: 0 };

function freshRoom(opts?: { isBotTable?: boolean }) {
  return makeRoom({
    id: 'room1',
    name: 'Test',
    description: '',
    createdBy: 'sys',
    maxPlayers: 6,
    passwordHash: null,
    smallBlind: 5,
    bigBlind: 10,
    turnDurationMs: 30000,
    buyInMinBb: 20,
    buyInMaxBb: 100,
    timebank: TIMEBANK,
    rake: RAKE,
    ante: 0,
    format: 'nlh',
    autoStartPlayers: 2,
    sessionDurationHours: 0,
    sitOutTimeoutMin: 30,
    waitlistDelayMin: 2,
    isBotTable: opts?.isBotTable ?? false,
  });
}

describe('activeHandPersistence', () => {
  it('serializeActiveHand → null для бот-стола', () => {
    const room = freshRoom({ isBotTable: true });
    room.players.set('A', createPlayer({ id: 'A', socketId: 's1', username: 'A', chips: 1000, position: 0, isFolded: false, timebank: 30 }));
    expect(serializeActiveHand(room)).toBeNull();
  });

  it('serializeActiveHand → null для пустой комнаты', () => {
    const room = freshRoom();
    expect(serializeActiveHand(room)).toBeNull();
  });

  it('round-trip: сериализация → применение на свежий makeRoom восстанавливает раздачу', () => {
    const room = freshRoom();
    const a = createPlayer({ id: 'A', socketId: 'sock-a', username: 'Alice', chips: 970, position: 0, isFolded: false, timebank: 25 });
    const b = createPlayer({ id: 'B', socketId: 'sock-b', username: 'Bob', chips: 1030, position: 1, isFolded: true, timebank: 30 });
    a.cards = [card('A', 's'), card('K', 's')];
    a.currentBet = 30;
    a.totalCommitted = 30;
    b.totalCommitted = 10;
    room.players.set('A', a);
    room.players.set('B', b);
    room.phase = 'flop';
    room.status = 'playing';
    room.communityCards = [card('2', 'h'), card('7', 'd'), card('9', 'c')];
    room.deck = [card('Q', 'h')];
    room.pot = 40;
    room.currentBet = 30;
    room.dealerIndex = 1;
    room.currentPlayerIndex = 0;
    room.actionsThisRound = new Set(['B']);
    room.lockedCallers = new Set(['A']);
    room.lastRaiseSize = 20;
    room.handIndex = 3;
    room.lastHandRake = 0;
    room.waitlist = [{ userId: 'C', username: 'Cara', buyInAmount: 1000, addedAt: 123 }];

    const snap = serializeActiveHand(room);
    expect(snap).not.toBeNull();

    const restored = freshRoom();
    applyActiveHandSnapshot(restored, snap!);

    expect(restored.phase).toBe('flop');
    expect(restored.status).toBe('playing');
    expect(restored.pot).toBe(40);
    expect(restored.currentBet).toBe(30);
    expect(restored.dealerIndex).toBe(1);
    expect(restored.currentPlayerIndex).toBe(0);
    expect(restored.communityCards).toEqual(room.communityCards);
    expect(restored.deck).toEqual(room.deck);
    expect(restored.actionsThisRound).toEqual(new Set(['B']));
    expect(restored.lockedCallers).toEqual(new Set(['A']));
    expect(restored.lastRaiseSize).toBe(20);
    expect(restored.handIndex).toBe(3);
    expect(restored.waitlist).toEqual(room.waitlist);

    // Порядок игроков сохранён (важно для dealerIndex/currentPlayerIndex).
    expect(Array.from(restored.players.keys())).toEqual(['A', 'B']);

    const ra = restored.players.get('A')!;
    expect(ra.chips).toBe(970);
    expect(ra.cards).toEqual(a.cards);
    expect(ra.currentBet).toBe(30);
    expect(ra.totalCommitted).toBe(30);
    // Транспортные поля сброшены — все восстановленные считаются отключёнными.
    expect(ra.socketId).toBe('');
    expect(ra.disconnected).toBe(true);
    expect(ra.disconnectTimer).toBeNull();

    const rb = restored.players.get('B')!;
    expect(rb.isFolded).toBe(true);
    expect(rb.totalCommitted).toBe(10);
  });
});

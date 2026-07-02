import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';

// kickUserForCompliance (ROADMAP §11.2) — self-exclusion/timeout активированы прямо сейчас,
// нужно немедленно вышибить ВСЕ сокеты юзера тем же путём, что single-session кик
// (forceDisconnectOtherSessions), а не просто заблокировать будущий вход.
describe('GameManager.kickUserForCompliance', () => {
  beforeEach(() => resetStorage());

  it('отрубает все сокеты юзера с payload {reason, until}, чужие не трогает', async () => {
    const { gm, io } = await createTestGameManager();
    const sockA1 = io.addSocket('A', 'Alice');
    const sockA2 = io.addSocket('A', 'Alice');
    const sockB1 = io.addSocket('B', 'Bob');

    const disconnected: string[] = [];
    for (const s of [sockA1, sockA2, sockB1]) {
      (s as unknown as { disconnect: (close?: boolean) => void }).disconnect = () => disconnected.push(s.id);
    }

    (gm as unknown as { kickUserForCompliance: (userId: string, reason: string, until: string) => void }).kickUserForCompliance(
      'A',
      'self-excluded',
      '2099-01-01T00:00:00.000Z',
    );

    expect(disconnected.sort()).toEqual([sockA1.id, sockA2.id].sort());
    expect(sockA1.emitted).toEqual([{ event: 'forceDisconnect', payload: { reason: 'self-excluded', until: '2099-01-01T00:00:00.000Z' } }]);
    expect(sockA2.emitted).toEqual([{ event: 'forceDisconnect', payload: { reason: 'self-excluded', until: '2099-01-01T00:00:00.000Z' } }]);
    expect(sockB1.emitted).toEqual([]);
  });

  it('тайм-аут использует тот же путь с reason="timeout"', async () => {
    const { gm, io } = await createTestGameManager();
    const sock = io.addSocket('A', 'Alice');
    (sock as unknown as { disconnect: (close?: boolean) => void }).disconnect = () => {};

    (gm as unknown as { kickUserForCompliance: (userId: string, reason: string, until: string) => void }).kickUserForCompliance(
      'A',
      'timeout',
      '2099-06-01T00:00:00.000Z',
    );

    expect(sock.emitted).toEqual([{ event: 'forceDisconnect', payload: { reason: 'timeout', until: '2099-06-01T00:00:00.000Z' } }]);
  });
});

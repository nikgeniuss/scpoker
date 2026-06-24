import { describe, it, expect } from 'vitest';
import { getFreezeInfo, isRoomFrozen, FREEZE_THRESHOLD_MS } from '../tableWatchdog.js';
import type { Room } from '../GameManager.js';

// Чистая детекция «зависшего» стола (вынесена из GameManager, см. checkFrozenTables).
// Фикстура — только поля, которые читает getFreezeInfo; остальное Room не нужно для этой логики.
const fixtureRoom = (over: Partial<Room> = {}): Room =>
  ({
    isBotTable: false,
    status: 'playing',
    turnEndsAt: null,
    turnTimebankEndsAt: null,
    showdownEndsAt: null,
    lastProgressAt: Date.now(),
    name: 'TestRoom',
    id: 'r1',
    phase: 'preflop',
    ...over,
  } as unknown as Room);

describe('tableWatchdog — getFreezeInfo / isRoomFrozen', () => {
  it('бот-стол никогда не считается зависшим', () => {
    const room = fixtureRoom({ isBotTable: true, lastProgressAt: Date.now() - FREEZE_THRESHOLD_MS * 10 });
    expect(isRoomFrozen(room, Date.now())).toBe(false);
  });

  it('status="waiting" (нет активной раздачи) — не зависание', () => {
    const room = fixtureRoom({ status: 'waiting', lastProgressAt: Date.now() - FREEZE_THRESHOLD_MS * 10 });
    expect(isRoomFrozen(room, Date.now())).toBe(false);
  });

  it('активный turnEndsAt в будущем (легитимный долгий таймбанк) — не зависание', () => {
    const now = Date.now();
    // Игрок думает с большим таймбанком: дедлайн через 10 минут, прогресса давно не было —
    // это нормально, не баг.
    const room = fixtureRoom({ turnEndsAt: now + 10 * 60_000, lastProgressAt: now - FREEZE_THRESHOLD_MS * 5 });
    expect(isRoomFrozen(room, now)).toBe(false);
  });

  it('turnEndsAt просрочен на < FREEZE_THRESHOLD_MS — ещё не зависание (могла быть просто задержка event loop)', () => {
    const now = Date.now();
    const room = fixtureRoom({ turnEndsAt: now - 10_000 });
    expect(isRoomFrozen(room, now)).toBe(false);
  });

  it('turnEndsAt просрочен на > FREEZE_THRESHOLD_MS — зависание', () => {
    const now = Date.now();
    const room = fixtureRoom({ turnEndsAt: now - (FREEZE_THRESHOLD_MS + 1000) });
    const info = getFreezeInfo(room, now);
    expect(info.frozen).toBe(true);
    expect(info.overdueMs).toBeGreaterThan(FREEZE_THRESHOLD_MS);
  });

  it('turnTimebankEndsAt просрочен — зависание (даже если turnEndsAt уже null, фаза 2)', () => {
    const now = Date.now();
    const room = fixtureRoom({ turnEndsAt: null, turnTimebankEndsAt: now - (FREEZE_THRESHOLD_MS + 1) });
    expect(isRoomFrozen(room, now)).toBe(true);
  });

  it('showdownEndsAt просрочен — зависание (застрял на показе шоудауна)', () => {
    const now = Date.now();
    const room = fixtureRoom({ showdownEndsAt: now - (FREEZE_THRESHOLD_MS + 1) });
    expect(isRoomFrozen(room, now)).toBe(true);
  });

  it('нет ни одного дедлайна, но lastProgressAt давно — зависание (все таймеры сброшены без переустановки)', () => {
    const now = Date.now();
    const room = fixtureRoom({ lastProgressAt: now - (FREEZE_THRESHOLD_MS + 1) });
    expect(isRoomFrozen(room, now)).toBe(true);
  });

  it('нет дедлайна, lastProgressAt недавно — не зависание (между раздачами/идёт раздача карт)', () => {
    const now = Date.now();
    const room = fixtureRoom({ lastProgressAt: now - 5000 });
    expect(isRoomFrozen(room, now)).toBe(false);
  });

  it('самый ранний из нескольких дедлайнов определяет просрочку', () => {
    const now = Date.now();
    const room = fixtureRoom({
      turnEndsAt: now + 60_000, // в будущем
      showdownEndsAt: now - (FREEZE_THRESHOLD_MS + 1), // в прошлом — этот должен сработать
    });
    expect(isRoomFrozen(room, now)).toBe(true);
  });
});

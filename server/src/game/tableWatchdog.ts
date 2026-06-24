import type { Room } from './GameManager.js';

// «Зависший» стол: раздача идёт (status='playing'), но дедлайн, который сервер сам себе назначил
// (ход/таймбанк/шоудаун), уже прошёл больше чем на FREEZE_THRESHOLD_MS — значит callback, который
// должен был продвинуть раздачу, не сработал (исключение/баг). Легитимно долгий ход с большим
// таймбанком сюда не попадает: пока дедлайн в будущем, он не считается просроченным.
// Если дедлайна вообще нет (между раздачами, либо все таймеры сброшены без переустановки —
// тот же класс бага) — судим по room.lastProgressAt (последний раз, когда раздача реально
// продвинулась; обновляется в GameManager.broadcastGameState).
// Бот-столы не проверяем — у них свой жизненный цикл (BotManager).
export const FREEZE_THRESHOLD_MS = 60_000;

export function getFreezeInfo(room: Room, now: number): { frozen: boolean; overdueMs: number } {
  if (room.isBotTable || room.status !== 'playing') return { frozen: false, overdueMs: 0 };
  const deadlines = [room.turnEndsAt, room.turnTimebankEndsAt, room.showdownEndsAt].filter(
    (d): d is number => d !== null,
  );
  const reference = deadlines.length > 0 ? Math.min(...deadlines) : room.lastProgressAt;
  const overdueMs = now - reference;
  return { frozen: overdueMs > FREEZE_THRESHOLD_MS, overdueMs };
}

export function isRoomFrozen(room: Room, now: number): boolean {
  return getFreezeInfo(room, now).frozen;
}

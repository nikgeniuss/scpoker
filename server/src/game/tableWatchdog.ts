import type { Room } from './GameManager.js';

// «Зависший» стол: раздача идёт (status='playing'), но дедлайн, который сервер сам себе назначил
// (ход/таймбанк/шоудаун), уже прошёл больше чем на FREEZE_THRESHOLD_MS — значит callback, который
// должен был продвинуть раздачу, не сработал (исключение/баг). Легитимно долгий ход с большим
// таймбанком сюда не попадает: пока дедлайн в будущем, он не считается просроченным.
// Если дедлайна вообще нет (между раздачами, либо все таймеры сброшены без переустановки —
// тот же класс бага) — судим по room.lastProgressAt (последний раз, когда раздача реально
// продвинулась; обновляется в GameManager.broadcastGameState).
// Бот-столы РАНЬШЕ не проверялись (расчёт на то, что BotDecisionScheduler сам себя чинит) —
// но у него есть тихие ранние return без логов (buildBotContext===null и т.п.), из-за которых
// стол может зависнуть НАВСЕГДА без единого пути восстановления (реальный инцидент 2026-08-23:
// «Уютный стол» простоял на pot=3/preflop несколько минут). turnEndsAt взводится через
// startTurnTimer одинаково и для бота, и для человека (см. GameManager.emitCurrentTurn) — тот же
// дедлайн-механизм работает и для ботов, поэтому включаем их в общую проверку.
export const FREEZE_THRESHOLD_MS = 60_000;

export function getFreezeInfo(room: Room, now: number): { frozen: boolean; overdueMs: number } {
  if (room.status !== 'playing') return { frozen: false, overdueMs: 0 };
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

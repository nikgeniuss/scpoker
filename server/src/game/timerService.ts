// Хелперы для управления таймерами раздачи. Принимают Room/Player + колбэки.
// Таймеры живут как поля Room/Player — хелперы лишь стандартизируют schedule/clear.
// GameManager импортирует отсюда (value); мы импортируем типы оттуда (type-only — нет цикла).
import type { Room, Player } from './GameManager.js';

// ─── Turn timers (phase 1 + phase 2 timebank) ───────────────────────────────

// Сбрасывает оба таймера хода и связанные поля — вызывать перед сменой хода/фазы/cleanup.
export function clearTurnTimers(room: Room): void {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  if (room.timebankTimer) { clearTimeout(room.timebankTimer); room.timebankTimer = null; }
  room.turnEndsAt = null;
  room.turnTimebankEndsAt = null;
  room.turnTimebankStartedAt = null;
  room.turnTimebankPlayerId = null;
}

// Phase 1: основной таймер хода. Сбрасывает предыдущие таймеры через clearTurnTimers.
export function scheduleTurnPhase1(room: Room, ms: number, onExpire: () => void): void {
  clearTurnTimers(room);
  room.turnEndsAt = Date.now() + ms;
  room.turnTimer = setTimeout(onExpire, ms);
}

// Phase 2: таймбанк. Завершает phase 1 (только turnTimer), запускает фазу 2.
export function scheduleTurnPhase2(room: Room, userId: string, durationSec: number, onExpire: () => void): void {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.turnEndsAt = null;
  const ms = durationSec * 1000;
  room.turnTimebankStartedAt = Date.now();
  room.turnTimebankEndsAt = Date.now() + ms;
  room.turnTimebankPlayerId = userId;
  room.timebankTimer = setTimeout(onExpire, ms);
}

// Sit-out: быстрый однофазный таймер без таймбанка (игрок отключён).
export function scheduleSitOutTimer(room: Room, ms: number, onExpire: () => void): void {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.turnEndsAt = Date.now() + ms;
  room.turnTimer = setTimeout(onExpire, ms);
}

// ─── Player disconnect timer ─────────────────────────────────────────────────

export function clearDisconnectTimer(player: Player): void {
  if (player.disconnectTimer) { clearTimeout(player.disconnectTimer); player.disconnectTimer = null; }
}

export function scheduleDisconnectTimer(player: Player, ms: number, onExpire: () => void): void {
  clearDisconnectTimer(player);
  player.disconnectTimer = setTimeout(onExpire, ms);
}

// ─── Autostart timer ─────────────────────────────────────────────────────────

export function clearStartTimer(room: Room): void {
  if (room.startTimer) { clearTimeout(room.startTimer); room.startTimer = null; }
  room.startCountdownEndsAt = null;
}

// ─── Showdown timer ──────────────────────────────────────────────────────────

export function clearShowdownTimer(room: Room): void {
  if (room.showdownTimer) { clearTimeout(room.showdownTimer); room.showdownTimer = null; }
  room.showdownEndsAt = null;
}

export function scheduleShowdownTimer(room: Room, ms: number, onExpire: () => void): void {
  clearShowdownTimer(room);
  room.showdownEndsAt = Date.now() + ms;
  room.showdownTimer = setTimeout(onExpire, ms);
}

// ─── Session timer ───────────────────────────────────────────────────────────

export function clearSessionTimer(room: Room): void {
  if (room.sessionTimer) { clearTimeout(room.sessionTimer); room.sessionTimer = null; }
}

export function scheduleSessionTimer(room: Room, ms: number, onExpire: () => void): void {
  clearSessionTimer(room);
  room.sessionTimer = setTimeout(onExpire, ms);
}

// ─── Waitlist timer ──────────────────────────────────────────────────────────

export function clearWaitlistTimer(room: Room): void {
  if (room.waitlistTimer) { clearTimeout(room.waitlistTimer); room.waitlistTimer = null; }
  room.waitlistPromoteEndsAt = null;
}

export function scheduleWaitlistTimer(room: Room, ms: number, endsAt: number, onExpire: () => void): void {
  room.waitlistPromoteEndsAt = endsAt;
  room.waitlistTimer = setTimeout(onExpire, ms);
}

// Снимок активной раздачи для восстановления при рестарте сервера (ROADMAP §9.2).
// Чистые функции (сериализация/применение, без io/таймеров) — таймеры пересоздаются заново
// вызовом существующих schedule*-функций GameManager после applyActiveHandSnapshot
// (см. GameManager.restoreActiveHands).
import type { Room, Player, WaitlistEntry } from './GameManager.js';
import type { Card, GamePhase, RoomStatus } from './types.js';
import type { HandAction } from './handHistory.js';

// Player без транспортных полей (socketId/disconnected/disconnectTimer) — при восстановлении
// все игроки заведомо отключены (свежий процесс, ни одного сокета).
export type PlayerSnapshot = Omit<Player, 'socketId' | 'disconnected' | 'disconnectTimer'>;

export interface ActiveHandSnapshot {
  roomId: string;
  status: RoomStatus;
  phase: GamePhase;
  communityCards: Card[];
  deck: Card[];
  pot: number;
  currentBet: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  actionsThisRound: string[];
  lockedCallers: string[];
  lastRaiseSize: number;
  handIndex: number;
  lastHandRake?: number;
  actionLog?: HandAction[];
  waitlist: WaitlistEntry[];
  players: PlayerSnapshot[]; // порядок = порядок Map (важен для dealerIndex/currentPlayerIndex)
}

// Бот-столы не персистим (BotManager пересоздаёт их сам — purgeBotTablesFromSnapshot);
// пустые комнаты — нечего восстанавливать.
export function serializeActiveHand(room: Room): ActiveHandSnapshot | null {
  if (room.isBotTable || room.players.size === 0) return null;

  const players: PlayerSnapshot[] = [];
  room.players.forEach((player) => {
    const { socketId: _socketId, disconnected: _disconnected, disconnectTimer: _disconnectTimer, ...rest } = player;
    players.push(rest);
  });

  return {
    roomId: room.id,
    status: room.status,
    phase: room.phase,
    communityCards: room.communityCards,
    deck: room.deck,
    pot: room.pot,
    currentBet: room.currentBet,
    dealerIndex: room.dealerIndex,
    currentPlayerIndex: room.currentPlayerIndex,
    actionsThisRound: Array.from(room.actionsThisRound),
    lockedCallers: Array.from(room.lockedCallers),
    lastRaiseSize: room.lastRaiseSize,
    handIndex: room.handIndex,
    lastHandRake: room.lastHandRake,
    actionLog: room.actionLog,
    waitlist: room.waitlist,
    players,
  };
}

// Мутирует уже созданную (через makeRoom) комнату — проставляет данные раздачи + игроков.
// Все восстановленные игроки помечаются disconnected=true (см. PlayerSnapshot) — обычная
// сит-аут защита (scheduleDisconnectTimer) даёт им окно на реконнект, как при обычном дисконнекте.
export function applyActiveHandSnapshot(room: Room, snap: ActiveHandSnapshot): void {
  room.status = snap.status;
  room.phase = snap.phase;
  room.communityCards = snap.communityCards;
  room.deck = snap.deck;
  room.pot = snap.pot;
  room.currentBet = snap.currentBet;
  room.dealerIndex = snap.dealerIndex;
  room.currentPlayerIndex = snap.currentPlayerIndex;
  room.actionsThisRound = new Set(snap.actionsThisRound);
  room.lockedCallers = new Set(snap.lockedCallers);
  room.lastRaiseSize = snap.lastRaiseSize;
  room.handIndex = snap.handIndex;
  room.lastHandRake = snap.lastHandRake;
  room.actionLog = snap.actionLog;
  room.waitlist = snap.waitlist;

  room.players = new Map();
  snap.players.forEach((p) => {
    room.players.set(p.id, { ...p, socketId: '', disconnected: true, disconnectTimer: null });
  });
}

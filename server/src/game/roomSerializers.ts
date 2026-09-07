import type { Room, RoomInfo } from './GameManager.js';
import type { RoomStatus, GamePhase } from './types.js';

// Чистые сериализаторы Room → DTO. Вынесены из GameManager (ROADMAP §9.3-B).
// Транспорт (io.emit) остаётся в GameManager; здесь — только маппинг.

// Вьюшка комнаты для админ-панели (вкладка «Комнаты»).
export interface AdminRoomView {
  id: string;
  name: string;
  status: RoomStatus;
  phase: GamePhase;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  maxPlayers: number;
  hasPassword: boolean;
  isBotTable: boolean;
  players: Array<{ id: string; username: string; chips: number; isFolded: boolean; disconnected: boolean; isBot: boolean }>;
}

// Список для лобби (без паролей). ВАЖНО: НЕ отдаём isBotTable — игроки не должны видеть авто-столы.
export function toRoomInfo(room: Room): RoomInfo {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.size,
    hasPassword: room.passwordHash !== null,
    status: room.status,
    createdBy: room.createdBy,
    playerIds: Array.from(room.players.keys()),
    players: Array.from(room.players.values()).map(p => ({ id: p.id, username: p.username, avatar: p.avatar })),
    turnDurationSec: Math.round(room.turnDurationMs / 1000),
    buyInMinBb: room.buyInMinBb,
    buyInMaxBb: room.buyInMaxBb,
    timebank: { ...room.timebank },
    waitlistIds: room.waitlist.map(w => w.userId),
    format: room.format,
    clubId: room.clubId,
    rake: room.rake,
    straddleEnabled: room.straddleEnabled,
    bombPotEnabled: room.bombPotEnabled,
    doubleBoardEnabled: room.doubleBoardEnabled,
    rimtEnabled: room.rimtEnabled,
    evCashoutEnabled: room.evCashoutEnabled,
    noTurnNoShowEnabled: room.noTurnNoShowEnabled,
    ...(room.noRatholeHours > 0 ? { noRatholeHours: room.noRatholeHours } : {}),
    antiCollusionEnabled: room.antiCollusionEnabled,
  };
}

// Полная вьюшка для админки (со стеками/фолдами/флагом бота). isBot инжектится (botIdentity → §D).
export function toAdminRoom(room: Room, isBot: (id: string) => boolean): AdminRoomView {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    phase: room.phase,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    pot: room.pot,
    maxPlayers: room.maxPlayers,
    hasPassword: !!room.passwordHash,
    isBotTable: !!room.isBotTable,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.username,
      chips: p.chips,
      isFolded: p.isFolded,
      disconnected: p.disconnected,
      isBot: isBot(p.id),
    })),
  };
}

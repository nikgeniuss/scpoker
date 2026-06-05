import type { Player } from './GameManager.js';

// Фабрика игрока за столом — дедуп идентичного литерала из addPlayer и seatBot (ROADMAP §9.3-B).
// Различаются только id/socketId/username/chips/position/isFolded/timebank; остальное — константы
// «свежего» игрока (пустые карты, не сфолдил по умолчанию определяет caller, нет таймеров).
export function createPlayer(params: {
  id: string;
  socketId: string;
  username: string;
  chips: number;
  position: number;
  isFolded: boolean;
  timebank: number;
}): Player {
  return {
    id: params.id,
    socketId: params.socketId,
    username: params.username,
    chips: params.chips,
    cards: [],
    isActive: true,
    isFolded: params.isFolded,
    currentBet: 0,
    position: params.position,
    avatar: '',
    disconnected: false,
    disconnectTimer: null,
    timebank: params.timebank,
    handsAtTable: 0,
    totalCommitted: 0,
  };
}

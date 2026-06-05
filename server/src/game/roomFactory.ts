import type { Room, TimebankConfig } from './GameManager.js';

// Фабрика комнаты — дедуп идентичного ~30-полевого литерала из loadRoomsSnapshot/createRoom/createBotTable
// (ROADMAP §9.3-B, RoomStore). Варьируются 14 полей; остальные — константы «свежей» комнаты в waiting
// (пустые игроки/борд/колода, нули, null-таймеры, handIndex=0).
export function makeRoom(params: {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  maxPlayers: number;
  passwordHash: string | null;
  smallBlind: number;
  bigBlind: number;
  turnDurationMs: number;
  buyInMinBb: number;
  buyInMaxBb: number;
  timebank: TimebankConfig;
  isBotTable: boolean;
  botTableLevel?: 'micro' | 'low' | 'mid';
}): Room {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    createdBy: params.createdBy,
    maxPlayers: params.maxPlayers,
    passwordHash: params.passwordHash,
    status: 'waiting',
    players: new Map(),
    communityCards: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    phase: 'waiting',
    smallBlind: params.smallBlind,
    bigBlind: params.bigBlind,
    actionsThisRound: new Set(),
    startTimer: null,
    startCountdownEndsAt: null,
    turnTimer: null,
    turnEndsAt: null,
    turnDurationMs: params.turnDurationMs,
    buyInMinBb: params.buyInMinBb,
    buyInMaxBb: params.buyInMaxBb,
    timebank: params.timebank,
    timebankTimer: null,
    turnTimebankEndsAt: null,
    turnTimebankStartedAt: null,
    turnTimebankPlayerId: null,
    isBotTable: params.isBotTable,
    botTableLevel: params.botTableLevel,
    handIndex: 0,
  };
}

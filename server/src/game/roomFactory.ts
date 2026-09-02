import type { Room, TimebankConfig } from './GameManager.js';
import type { RakeConfig } from './rake.js';
import type { GameFormat } from './types.js';

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
  rake: RakeConfig;
  ante: number;
  format: GameFormat;
  autoStartPlayers: number;
  sessionDurationHours: number;
  sessionEndsAt?: number | null;
  sitOutTimeoutMin: number;
  waitlistDelayMin: number;
  isBotTable: boolean;
  botTableLevel?: 'micro' | 'low' | 'mid';
  clubId?: string;
  pinned?: boolean;
  autoExtendSession?: boolean;
  tournamentId?: string;
  straddleEnabled?: boolean;
  bombPotEnabled?: boolean;
  doubleBoardEnabled?: boolean;
  rimtEnabled?: boolean;
  evCashoutEnabled?: boolean;
  noTurnNoShowEnabled?: boolean;
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
    lastRaiseSize: 0,
    lockedCallers: new Set(),
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
    showdownTimer: null,
    showdownEndsAt: null,
    lastProgressAt: Date.now(),
    isBotTable: params.isBotTable,
    botTableLevel: params.botTableLevel,
    clubId: params.clubId,
    handIndex: 0,
    rake: params.rake,
    lastHandRake: 0,
    ante: params.ante,
    format: params.format,
    autoStartPlayers: params.autoStartPlayers,
    sessionDurationHours: params.sessionDurationHours,
    sessionEndsAt: params.sessionEndsAt ?? null,
    sessionTimer: null,
    autoExtendSession: params.autoExtendSession ?? false,
    pinned: params.pinned ?? false,
    sitOutTimeoutMin: params.sitOutTimeoutMin,
    kickCooldowns: new Map(),
    waitlistDelayMin: params.waitlistDelayMin,
    waitlist: [],
    waitlistTimer: null,
    waitlistPromoteEndsAt: null,
    observers: new Map(),
    rabbitHuntPaidBy: new Set(),
    tournamentId: params.tournamentId,
    straddleEnabled: params.straddleEnabled ?? false,
    bombPotEnabled: params.bombPotEnabled ?? false,
    doubleBoardEnabled: params.doubleBoardEnabled ?? false,
    rimtEnabled: params.rimtEnabled ?? false,
    evCashoutEnabled: params.evCashoutEnabled ?? false,
    noTurnNoShowEnabled: params.noTurnNoShowEnabled ?? false,
    // Всегда включена, не настраивается — решение пользователя 2026-08-24 (security review):
    // тумблер, доступный создателю стола, отдавал контроль над защитой от сговора тем, от кого
    // она должна защищать (двое сговорившихся создают свой стол с дефолтным OFF).
    antiCollusionEnabled: true,
    communityCardsB: null,
    deckB: null,
  };
}

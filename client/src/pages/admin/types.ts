// Общие типы и константы админ-вкладок. Вынесено из Admin.tsx (ROADMAP §9.3-E).

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'player';
  chips: number;
  createdAt: string;
  banned: boolean;
  publicId?: string;
  country?: string;
}

export type RoleFilter = 'all' | 'admin' | 'player' | 'banned';
export type SortBy = 'username' | 'chips' | 'created';

export interface AdminRoom {
  id: string;
  name: string;
  status: 'waiting' | 'playing';
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  smallBlind: number;
  bigBlind: number;
  pot: number;
  maxPlayers: number;
  hasPassword: boolean;
  players: Array<{ id: string; username: string; chips: number; isFolded: boolean; disconnected: boolean }>;
}

export const ROOM_PHASE_LABEL: Record<AdminRoom['phase'], string> = {
  waiting: 'Ожидание',
  preflop: 'Префлоп',
  flop: 'Флоп',
  turn: 'Тёрн',
  river: 'Ривер',
  showdown: 'Шоудаун',
};

export interface TimebankSettings {
  enabled: boolean;
  startSec: number;
  bonusSec: number;
  bonusEveryHands: number;
  capSec: number;
  allowPerTableOverride: boolean;
}

export interface BotModeSettings {
  enabled: boolean;
  peekMode: 'river' | 'turn' | 'full';
  tablesPerLevel: number;
  botsPerTable: number;
  defaultBuyInBb: number;
  refillIntervalMs: number;
}

export interface GameSettings {
  turnDurationMs: number;
  autostartDelayMs: number;
  defaultPlayerChips: number;
  timebank: TimebankSettings;
  botMode: BotModeSettings;
}

export interface BotMetaView {
  id: string;
  username: string;
  chips: number;
  targetPnL: 'zero' | 'plus' | 'minus';
  persona: {
    aggression: number;
    bluffRate: number;
    vpip: number;
  };
  roomId: string | null;
  realizedPnL: number;
  handsPlayed: number;
  bluffCountLast50: number;
  bluffCallCountLast50: number;
}

export const TARGET_LABEL: Record<'zero' | 'plus' | 'minus', string> = {
  zero: 'В ноль',
  plus: 'В плюс',
  minus: 'В минус',
};

export const TARGET_COLOR: Record<'zero' | 'plus' | 'minus', string> = {
  zero: 'bg-gray-600',
  plus: 'bg-emerald-600',
  minus: 'bg-rose-600',
};

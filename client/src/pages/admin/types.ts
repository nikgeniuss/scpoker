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
  lastLogin?: string;
  alias?: string;
  note?: string;
  pnl?: number;   // PnL за всё время (из hands-лога; для сортировки/деталей)
  hands?: number; // сыграно рук за всё время
}

// Агрегат статистики игрока за период (эндпоинт GET /admin/users/:id/stats)
export interface PlayerStats {
  hands: number;
  pnl: number;
  rake: number;
}

export type RoleFilter = 'all' | 'admin' | 'player' | 'banned';
export type SortBy = 'username' | 'chips' | 'created' | 'pnl';

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

export interface PaidFeaturesSettings {
  rabbitHunt: {
    enabled: boolean;
    mode: 'fixed' | 'percent';
    fixedAmount: number;
    percent: number;
  };
}

export interface GameSettings {
  turnDurationMs: number;
  autostartDelayMs: number;
  defaultPlayerChips: number;
  timebank: TimebankSettings;
  botMode: BotModeSettings;
  paidFeatures: PaidFeaturesSettings;
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
  totalPnL: number;
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

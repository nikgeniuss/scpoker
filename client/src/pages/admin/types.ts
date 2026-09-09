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
  twoFactorEnabled?: boolean;
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

// Запись журнала восстановлений зависших столов (эндпоинт GET /admin/frozen-tables).
export interface FrozenTableRecordView {
  t: number;
  roomId: string;
  name: string;
  phase: string;
  overdueMs: number;
}

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
  hudMode: 'free' | 'paid'; // HUD соперников: всем бесплатно либо по подписке (§10.21.13)
}

export type PaymentChain = 'tron' | 'ethereum' | 'bsc';

export interface PaymentsChainSettings {
  enabled: boolean;
  minConfirmations: number;
}

export interface PaymentsSettings {
  enabled: boolean;
  exchangeRateCentsPerUsdt: number;
  minDepositUsdt: number;
  maxDepositUsdt: number;
  minWithdrawalUsdt: number;
  maxWithdrawalUsdt: number;
  chains: Record<PaymentChain, PaymentsChainSettings>;
}

export interface ResponsibleGamblingSettings {
  depositLimitEnabled: boolean;
  lossLimitEnabled: boolean;
  sessionTimeLimitEnabled: boolean;
  selfExclusionEnabled: boolean;
  timeoutEnabled: boolean;
}

export interface GameSettings {
  turnDurationMs: number;
  autostartDelayMs: number;
  defaultPlayerChips: number;
  timebank: TimebankSettings;
  botMode: BotModeSettings;
  paidFeatures: PaidFeaturesSettings;
  payments: PaymentsSettings;
  responsibleGambling: ResponsibleGamblingSettings;
}

export interface WithdrawalRequestView {
  id: string;
  userId: string;
  username: string;
  chain: PaymentChain;
  amountChips: number;
  amountUsdtRaw: string;
  payoutAddress: string;
  status: 'pending' | 'approved' | 'sending' | 'paid' | 'rejected' | 'failed';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  txid?: string;
  failReason?: string;
}

export interface HotWalletBalanceView {
  address: string;
  native: string;
  usdt: string;
}

export const CHAIN_LABEL: Record<PaymentChain, string> = {
  tron: 'Tron (TRC-20)',
  ethereum: 'Ethereum (ERC-20)',
  bsc: 'BSC (BEP-20)',
};

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

// Запись лога массовых выдач/возвратов фишек (эндпоинт GET /admin/chip-ops, §10.9).
export interface ChipOpEntry {
  ts: number;
  by: string;
  mode: 'add' | 'subtract';
  amount: number;
  usernames: string[];
}

// Журнал турнирной экономики (/admin/tournament-ledger). Строка на завершённый турнир:
// сколько собрано за входы, сколько удержано рейком, сколько доплачено оверлеем (эмиссия фишек).
export interface TournamentLedgerEntry {
  tournamentId: string;
  name: string;
  type: 'sng' | 'mtt';
  finishedAt: number;
  entries: number;
  uniquePlayers: number;
  collectedFees: number;
  rake: number;
  bounty: number;
  overlay: number;
  prizePool: number;
  paidOut: number;
  net: number;
}

export interface TournamentLedgerTotals {
  tournaments: number;
  collectedFees: number;
  rake: number;
  overlay: number;
  paidOut: number;
  net: number;
}

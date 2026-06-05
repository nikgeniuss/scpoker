export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  username: string;
  chips: number;
  cards: Card[];
  isActive: boolean;
  isFolded: boolean;
  currentBet: number;
  position: number;
  avatar: string;
  disconnected: boolean;
  timebank?: number; // оставшиеся секунды таймбанка (только если timebankEnabled в GameState)
}

export type GamePhase = 
  | 'waiting' 
  | 'preflop' 
  | 'flop' 
  | 'turn' 
  | 'river' 
  | 'showdown';

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

export interface GameState {
  roomId: string;
  roomName: string;
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  phase: GamePhase;
  winners: Player[] | null;
  turnEndsAt: number | null; // timestamp окончания основного таймера хода
  turnDurationSec: number; // полная длительность основного таймера (для расчёта % прогресс-кольца)
  // Если != null — основной таймер истёк, идёт таймбанк-фаза, после неё auto-fold.
  // Клиент при ненулевом значении рисует второй (оранжевый) индикатор у активного игрока.
  turnTimebankEndsAt: number | null;
  turnTimebankStartedAt: number | null; // timestamp начала таймбанк-фазы (для расчёта % прогресс-кольца Phase 2)
  timebankEnabled: boolean; // глобальный/per-table флаг для UI (показывать ли индикаторы таймбанка)
  smallBlind: number;
  bigBlind: number;
  // Admin-peek (см. roadmap admin-tools): отдаётся ТОЛЬКО админу с включённым peek.
  // Содержит следующие 5 карт из колоды (будущий флоп/тёрн/ривер). У обычного игрока undefined.
  futureBoard?: Card[];
}

export const SOCKET_EVENTS = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  PLAYER_ACTION: 'playerAction',
  CREATE_ROOM: 'createRoom',
  START_GAME: 'startGame',
  ROOM_JOINED: 'roomJoined',
  GAME_UPDATE: 'gameUpdate',
  PLAYER_LEFT: 'playerLeft',
  ERROR: 'error',
  ROOM_LIST: 'roomList',
  YOUR_TURN: 'yourTurn',
  LOBBY_SUBSCRIBE: 'lobby:subscribe',
  LOBBY_UNSUBSCRIBE: 'lobby:unsubscribe',
  ROOM_CREATED: 'roomCreated',
  JOIN_DENIED: 'joinDenied',
  GAME_WINNER: 'gameWinner',
  START_COUNTDOWN: 'startCountdown',
  PLAYER_ACTION_BROADCAST: 'playerActionBroadcast', // {playerId, action, amount?} — для speech bubble над аватаром
  SEND_EMOJI: 'sendEmoji',                          // клиент → сервер: {roomId, emoji}
  EMOJI_BROADCAST: 'emojiBroadcast',                // сервер → клиент: {playerId, emoji}
  BANKROLL_UPDATE: 'bankrollUpdate',                // сервер → клиент: {chips} — при изменении users.chips
  ADMIN_PEEK_TOGGLE: 'adminPeekToggle',             // клиент → сервер: {enabled} — включить/выключить «глаз админа»
  REQUEST_GAME_STATE: 'requestGameState',           // клиент → сервер: {roomId} — запрос актуального state на mount (reload/реконнект)
  FORCE_DISCONNECT: 'forceDisconnect',              // сервер → клиент: старый сокет того же user отрублен (single-session)
} as const;

export type RoomStatus = 'waiting' | 'playing';

// Конфигурация таймбанка для одного стола (без allowPerTableOverride —
// это поле только в глобальном TimebankSettings).
export interface TimebankConfig {
  enabled: boolean;
  startSec: number;          // стартовый запас при посадке (если enabled)
  bonusSec: number;          // сколько секунд добавляется каждые bonusEveryHands рук
  bonusEveryHands: number;   // частота пополнения (например, каждые 10 рук)
  capSec: number;            // максимум, выше которого таймбанк не накапливается
}

// Глобальные настройки таймбанка (живут в settings.json).
// Если allowPerTableOverride=false — все новые столы используют этот конфиг как есть,
// в CreateRoomModal секция таймбанка скрыта.
export interface TimebankSettings extends TimebankConfig {
  allowPerTableOverride: boolean;
}

// Бот: цель PnL — определяет direction'ы корректировки в decideAction.
// 'zero' — статистически держится в нуле; 'plus' — медленно набирает; 'minus' — медленно сливает.
export type BotPnLTarget = 'zero' | 'plus' | 'minus';

// Когда бот «видит» карты соперников и будущий борд. Настраивается админом глобально.
// 'river' — только на ривере (естественнее, рекомендуемый MVP).
// 'turn' — с тёрна (видит 1 будущую карту ривера).
// 'full' — со старта раздачи (видит всё). Требует blendStrength для незаметности.
export type BotPeekMode = 'river' | 'turn' | 'full';

// Поведенческий профиль бота. Каждый бот имеет свой — чтобы не было «все боты ходят одинаково».
export interface BotPersona {
  aggression: number;    // 0.2–0.8: насколько часто рейзит вместо колла
  bluffRate: number;     // 0.03–0.10: частота блефов слабой рукой
  heroFoldRate: number;  // 0.02–0.05: частота фолда сильной руки в большой банк
  slowplayRate: number;  // 0.05–0.20: частота колла монстра вместо рейза
  vpip: number;          // 0.20–0.45: целевой voluntary-put-in-pot процент
  reactionFast: [number, number];  // [мин, макс] мс «быстрых» решений
  reactionSlow: [number, number];  // [мин, макс] мс «думающих» решений
  fastBias: number;      // 0.5–0.8: доля быстрых vs думающих
}

// Бот как сущность (хранится в bots.json — отдельно от users.json).
export interface BotInfo {
  id: string;             // 'bot:xxx' префикс
  username: string;       // человечное имя, без меток "бот"
  chips: number;          // банкролл бота (его «личные» фишки)
  targetPnL: BotPnLTarget;
  persona: BotPersona;
  createdAt: string;
}

// Глобальный bot-mode конфиг в settings.json
export interface BotModeSettings {
  enabled: boolean;
  peekMode: BotPeekMode;      // настраивается админом
  tablesPerLevel: number;      // сколько столов на каждый уровень (микро/низкие/средние). Дефолт 1.
  botsPerTable: number;        // сколько ботов сажать за каждый автостол. Дефолт 3.
  defaultBuyInBb: number;      // в каких BB бот заходит по дефолту (например, 100).
  refillIntervalMs: number;    // как часто проверять, что бот-столы укомплектованы. Дефолт 120000 (2 мин).
}

export interface RoomInfo {
  id: string;
  name: string;
  description: string; // описание стола; пустая строка если не задано
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  currentPlayers: number;
  hasPassword: boolean;
  status: RoomStatus;
  createdBy: string;
  playerIds: string[]; // id игроков, чтобы клиент мог отметить «я здесь»
  players: Array<{ id: string; username: string }>; // расширенный список для превью аватаров в лобби
  turnDurationSec: number; // время на ход (сек), per-table override
  buyInMinBb: number; // нижняя граница бай-ина в больших блайндах
  buyInMaxBb: number; // верхняя граница бай-ина в больших блайндах
  timebank: TimebankConfig; // настройки таймбанка для этого стола (per-table)
  isBotTable?: boolean; // true для автоматически созданных бот-столов. В getRoomList НЕ отдаётся,
                        // только в getAdminRoomList — игроки не должны видеть, что стол «бот».
}

export interface CreateRoomOptions {
  name: string;
  description?: string; // 0..200 символов
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  password?: string;
  turnDurationSec: number; // 5..120 сек
  buyInMinBb: number; // 5..1000
  buyInMaxBb: number; // buyInMinBb..1000
  // Если задан и сервер разрешает per-table override — используется как конфиг стола.
  // Если override запрещён глобально — поле игнорируется, копируется глобал.
  timebank?: TimebankConfig;
}

export type JoinDeniedReason =
  | 'not-found'
  | 'wrong-password'
  | 'password-required'
  | 'full'
  | 'in-game'
  | 'kicked'
  | 'closed'
  | 'no-chips'
  | 'insufficient-bankroll' // банкролл < bigBlind*buyInMinBb
  | 'invalid-buyin';        // запрошенная сумма вне [bigBlind*minBb, bigBlind*maxBb]

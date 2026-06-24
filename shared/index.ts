export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

// Формат игры: NLH (52 карты) или Шорт-дэк (36, без 2–5; флеш > фулл; младший стрит A-6-7-8-9).
export type GameFormat = 'nlh' | 'shortdeck';

// Сиды для выбора аватара в профиле (react-nice-avatar genConfig(seed) — детерминированное лицо).
// Список фиксирован — менять состав нельзя без миграции уже выбранных игроками значений.
export const AVATAR_PRESETS: string[] = [
  'av-01', 'av-02', 'av-03', 'av-04', 'av-05', 'av-06', 'av-07', 'av-08', 'av-09', 'av-10',
  'av-11', 'av-12', 'av-13', 'av-14', 'av-15', 'av-16', 'av-17', 'av-18', 'av-19', 'av-20',
  'av-21', 'av-22', 'av-23', 'av-24', 'av-25', 'av-26', 'av-27', 'av-28', 'av-29', 'av-30',
];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  username: string;
  displayName?: string; // имя из Telegram (first_name) для привязанных TG-аккаунтов; иначе показываем username
  chips: number;
  cards: Card[];
  isActive: boolean;
  isFolded: boolean;
  currentBet: number;
  position: number;
  avatar: string; // выбранный seed аватара (react-nice-avatar, из AVATAR_PRESETS); '' = фоллбэк на id
  disconnected: boolean;
  timebank?: number; // оставшиеся секунды таймбанка (только если timebankEnabled в GameState)
  // Подсказки (по тумблеру «Подсказка комбинации» в настройках игры). Сервер отдаёт только тем,
  // кому карты видны (§0.1): своя — всегда, чужие — админу с peek / на showdown.
  handHint?: string;  // название текущей комбинации (у админа на своём месте — итоговая)
  winChance?: number; // 0..100, шанс выиграть раздачу (только своё место; считается против случайных)
  // Добровольно показанные после раздачи карты (тап): длина 2, элемент = карта (видна всем) или null.
  shownCards?: (Card | null)[];
  revealedCards?: number[]; // индексы показанных карт (публично) — для UI владельца («показана»)
  hudStats?: { vpip: number; pfr: number; hands: number }; // HUD-lite: VPIP/PFR% по истории
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
  format: GameFormat; // 'nlh' | 'shortdeck' — формат стола (UI-лейблы)
  badBeatEligible?: boolean; // стол участвует в BBJ (публичный + не bot-стол + джекпот включён)
  rake: RakeConfig; // per-table рейк (percent/capBb), для показа в TableInfoModal (percent=0 → выключен)
  // Платная фича Rabbit Hunting (ROADMAP §10.12): если рука закончилась раньше ривера, можно за
  // плату увидеть карты, которые пришли бы. Окно — только пока phase==='showdown'. revealed=null —
  // зритель ещё не оплатил (только цена видна); массив — оплатил, карты раскрыты лично ему (§0.1-стиль:
  // персонально через сериализатор, не broadcast всем).
  rabbitHunt?: { price: number; revealed: Card[] | null };
  observers?: { id: string; username: string }[]; // наблюдатели (не сидящие за столом)
  // Admin-peek (см. roadmap admin-tools): отдаётся ТОЛЬКО админу с включённым peek.
  // Содержит следующие 5 карт из колоды (будущий флоп/тёрн/ривер). У обычного игрока undefined.
  futureBoard?: Card[];
  // Турнирный стол (§10 «Турниры»): если задан — клиент рисует турнирный HUD вместо обычного
  // стола (нельзя выйти с забором фишек, блайнды растут по уровням — см. GET /api/tournaments/:id).
  tournamentId?: string;
}

export const SOCKET_EVENTS = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  SET_HAND_HINT: 'setHandHint',                      // клиент → сервер: {roomId, enabled} — включить подсказку комбинации/шансов (сервер считает equity только для включивших)
  SHOW_CARD: 'showCard',                             // клиент → сервер: {roomId, index} — добровольно показать свою карту (тап после раздачи, видно всем)
  OBSERVE_ROOM: 'observeRoom',                       // клиент → сервер: {roomId} — войти наблюдателем (без посадки; карты соперников скрыты, у админа — видны)
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
  JOIN_WAITLIST: 'joinWaitlist',                    // клиент → сервер: {roomId, password?, buyInAmount} — встать в очередь на полный стол
  LEAVE_WAITLIST: 'leaveWaitlist',                  // клиент → сервер: {roomId} — выйти из очереди
  SEAT_FROM_WAITLIST: 'seatFromWaitlist',           // сервер → клиент: {roomId} — место освободилось, посажен из очереди
  SET_AUTO_TOPUP: 'setAutoTopUp',                   // клиент → сервер: {roomId, enabled, thresholdBb, targetBb} — преференция авто-докупки стека
  INBOX_NOTIFICATION: 'inboxNotification',          // сервер → клиент: {notification} — новое уведомление во «Входящих»
  RABBIT_HUNT: 'rabbitHunt',                        // клиент → сервер: {roomId} — заплатить и увидеть карты, которые пришли бы (Rabbit Hunting)
  TOURNAMENT_TABLE_ASSIGNED: 'tournamentTableAssigned', // сервер → клиент: {tournamentId, roomId} — турнир стартовал/пересадка, переход на стол
} as const;

// Уведомление во «Входящих» игрока (§10.13).
export interface InboxNotification {
  id: string;
  userId: string;
  type: 'chips' | 'ban' | 'unban' | 'broadcast' | 'deposit' | 'withdrawal';
  text: string;
  read: boolean;
  t: number; // epoch ms
}

// Платежи (§11.1 ROADMAP) — крипто-депозит/вывод USDT без посредника.
// 'tron' = TRC-20, 'ethereum' = ERC-20, 'bsc' = BEP-20. EVM-адрес общий для ethereum/bsc.
export type PaymentChain = 'tron' | 'ethereum' | 'bsc';
export type ChainFamily = 'tron' | 'evm';

export interface PaymentsChainSettings {
  enabled: boolean;
  minConfirmations: number;
}

// Курс и лимиты — в USDT-«сотых» (как и деньги в проекте — целые центы, см. chipFormat.ts);
// exchangeRateCentsPerUsdt = сколько центов фишек равны 1 USDT.
export interface PaymentsSettings {
  enabled: boolean;
  exchangeRateCentsPerUsdt: number;
  minDepositUsdt: number;
  maxDepositUsdt: number;
  minWithdrawalUsdt: number;
  maxWithdrawalUsdt: number;
  chains: Record<PaymentChain, PaymentsChainSettings>;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'sending' | 'paid' | 'rejected' | 'failed';

export interface WithdrawalRequest {
  id: string;
  userId: string;
  username: string;
  chain: PaymentChain;
  amountChips: number;
  amountUsdtRaw: string; // bigint как строка (JSON не умеет bigint)
  payoutAddress: string;
  status: WithdrawalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  txid?: string;
  failReason?: string;
}

export interface DepositRecord {
  txid: string;
  chain: PaymentChain;
  userId: string;
  address: string;
  amountUsdtRaw: string;
  amountChipsCredited: number;
  blockNumber: number;
  creditedAt: string;
  swept: boolean; // перенесены ли реальные USDT с депозитного адреса на хот-кошелёк (sweepService)
  sweepTxid?: string;
}

export interface WalletMapping {
  userId: string;
  chainFamily: ChainFamily;
  address: string;
  derivationIndex: number;
  createdAt: string;
}

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
  botsPerTable: number;        // МАКСИМУМ ботов за автостол; реальное число варьируется в [2..этого] и «дышит». Дефолт 6.
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
  players: Array<{ id: string; username: string; avatar: string }>; // расширенный список для превью аватаров в лобби
  turnDurationSec: number; // время на ход (сек), per-table override
  buyInMinBb: number; // нижняя граница бай-ина в больших блайндах
  buyInMaxBb: number; // верхняя граница бай-ина в больших блайндах
  timebank: TimebankConfig; // настройки таймбанка для этого стола (per-table)
  waitlistIds: string[]; // userId в очереди (порядок = приоритет посадки); клиент находит свою позицию
  format: GameFormat; // 'nlh' | 'shortdeck' — формат стола
  clubId?: string;      // если задан — стол видим только членам клуба
  rake: RakeConfig;     // per-table рейк, чтобы игрок видел % и cap до посадки (percent=0 → выключен)
}

// Per-table рейк (комиссия рума с банка). percent=0 → выключен. (см. server/src/game/rake.ts)
export interface RakeConfig {
  percent: number; // % от банка, 0..100
  capBb: number;   // потолок рейка в больших блайндах, 0..100
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
  rake?: RakeConfig; // per-table рейк (percent/capBb). Не задан → рейк выключен.
  ante?: number; // анте в фишках, вносят все до блайндов (0/не задан = нет)
  sessionDurationHours?: number; // авто-закрытие стола через N часов (0/не задан = без ограничения)
  autoStartPlayers?: number; // автостарт раздачи от N игроков (2..maxPlayers, по умолчанию 2)
  sitOutTimeoutMin?: number; // сит-аут при дисконнекте: сколько минут игрок держит место (5..30, дефолт 30)
  waitlistDelayMin?: number; // задержка авто-посадки из очереди после освобождения места (2..10, дефолт 2)
  format?: GameFormat; // формат стола ('nlh' по умолчанию)
  clubId?: string;     // если задан — стол привязан к клубу (виден только членам)
  pinned?: boolean;    // закрепить стол сверху лобби (только админ; проверяется на сервере)
  autoExtendSession?: boolean; // по истечении sessionDurationHours продлевать сессию повторно вместо закрытия
}

// Турниры (ROADMAP §10 «Турниры», SNG → MTT). 'mtt' зарезервирован под Фазу 2, сервер v1 принимает
// только 'sng' при создании. Турнирные фишки — НЕ банкролл: бай-ин дебетуется один раз при
// регистрации, выплата призовых кредитуется один раз при завершении (tournamentBankroll.ts).
export type TournamentType = 'sng' | 'mtt';
export type TournamentStatus = 'registering' | 'running' | 'finished' | 'cancelled';
export type BlindSpeed = 'slow' | 'regular' | 'turbo' | 'hyper';

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMin: number;
}

export interface PayoutTier {
  place: number;   // 1 = первое место
  percent: number; // % от призового фонда (сумма по всем местам = 100)
}

export type TournamentEntryStatus = 'registered' | 'playing' | 'eliminated';

// Преднастройка ITM% для MTT (доля призовых мест от общего числа участников) — выбор админа при создании.
export type MttItmPercent = 10 | 12 | 15 | 20;

export interface TournamentEntry {
  userId: string;
  username: string;
  status: TournamentEntryStatus;
  tableId?: string;     // id текущего стола (MTT, только пока status==='playing')
  finishPlace?: number; // присваивается при элиминации/завершении (1 = победитель)
  prize?: number;       // выплаченные фишки по результату (есть только у призовых мест после finished)
}

export interface TournamentInfo {
  id: string;
  name: string;
  type: TournamentType;
  format: GameFormat;
  status: TournamentStatus;
  buyIn: number;          // фишки за вход
  startingStack: number;
  tableSize: number;      // мест за ОДНИМ столом (SNG = общее число участников турнира, т.к. стол один)
  blindSpeed: BlindSpeed;
  levelUpMinutes: number;
  prizePool: number;      // buyIn * entries.length (без рейка в v1)
  entries: TournamentEntry[];
  tableIds: string[];      // id игровых столов после старта (SNG — всегда 1 элемент, MTT — несколько)
  lateRegMinutes: number; // MTT: окно поздней регистрации после старта, минут (0 = нет позднего рега)
  itmPercent: MttItmPercent; // MTT: доля призовых мест от числа участников
  createdBy: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface CreateTournamentOptions {
  name: string;
  type: TournamentType;
  format: GameFormat;
  buyIn: number;         // целые фишки, >0
  startingStack: number; // целые фишки, >0
  tableSize: number;     // 2..9
  blindSpeed: BlindSpeed;
  levelUpMinutes: number; // 1..60
  lateRegMinutes?: number;  // MTT, по умолчанию 0
  itmPercent?: MttItmPercent; // MTT, по умолчанию 15
}

export type JoinDeniedReason =
  | 'not-found'
  | 'wrong-password'
  | 'password-required'
  | 'full'
  | 'in-game'
  | 'kicked'
  | 'on-cooldown'           // временный кик админом: вход за стол закрыт N минут (без бана)
  | 'closed'
  | 'no-chips'
  | 'insufficient-bankroll' // банкролл < bigBlind*buyInMinBb
  | 'invalid-buyin'         // запрошенная сумма вне [bigBlind*minBb, bigBlind*maxBb]
  | 'club-members-only';    // стол только для членов клуба

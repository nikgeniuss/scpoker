import { Server, Socket } from 'socket.io';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { createDeck, shuffleDeck, dealCards, dealCommunityCards, getFutureBoardCards } from './deck.js';
import { evaluateHand, formatHandName } from './hands.js';
import { readJSON, writeJSON } from '../auth/storage.js';
import { BotManager, type GameManagerForBots, type BotInfo, type BotModeSettings } from './BotManager.js';
import type { BotDecisionContext, BotDecision } from './botBrain.js';
import { toRoomTimebank, validateTimebankConfig, validateCreateOptions } from './roomValidation.js';
import { createPlayer } from './playerFactory.js';
import { makeRoom } from './roomFactory.js';
import { BankrollService } from './bankrollService.js';
import { toRoomInfo, toAdminRoom, type AdminRoomView } from './roomSerializers.js';
import { isLegalRaise } from './bettingRules.js';
import { isRoundComplete, computePhaseTransition } from './phaseRules.js';
import type { Card, GamePhase, RoomStatus, GameFormat } from './types.js';
import { isBot as isBotId } from './botIdentity.js';
import { serializeGameState } from './gameStateSerializer.js';
import { handHintName } from './handHint.js';
import { winProbabilityVsRandom, computeRealEquity } from './equity.js';
import { computeRabbitHuntEligibility, canPayRabbitHunt } from './rabbitHuntService.js';
import { readClubs } from './clubsStorage.js';
import type { HandStatRecord } from './statsService.js';
import type { RoomEventRecord } from './roomEvents.js';
import { getHudStats, type HandHistoryRecord, type HandAction } from './handHistory.js';
import { computeRake, normalizeRake, type RakeConfig } from './rake.js';
import { getBadBeatState, addToPool, payoutFromPool } from './badBeatService.js';
import { applyRakeback } from './rakebackService.js';
import { selectTier } from './badBeatDrop.js';
import { detectBadBeat, computeBadBeatPayout } from './badBeatDetect.js';
import { resolveShowdown, type ShowdownResult } from './showdownService.js';
import { resolveMultiRunShowdown } from './multiRunService.js';
import { hasNetworkCollision } from './antiCollusion.js';
import { sendNotification, type InboxNotification } from './inboxService.js';
import { serializeActiveHand, applyActiveHandSnapshot } from './activeHandPersistence.js';
import { getFreezeInfo } from './tableWatchdog.js';
import { forceDisconnectOtherSessions, disconnectSocketsBySid } from '../socket/sessionManager.js';
import { SessionTimeWatchdog } from './sessionTimeWatchdog.js';
import { getResponsibleGamblingState, markResponsibleGamblingWarned } from '../auth/auth.js';
import { aggregateUserStats } from './statsService.js';
import { periodRange, isLimitCrossed } from './responsibleGamblingService.js';
import type { FrozenTableRecord } from './frozenTableLog.js';
import type { GameState as SharedGameState, RoomInfo, TimebankConfig, TimebankSettings, PaymentsSettings, ResponsibleGamblingSettings } from '@poker-room/shared';
export type { RoomInfo, TimebankConfig, TimebankSettings };
import {
  clearTurnTimers, scheduleTurnPhase1, scheduleTurnPhase2, scheduleSitOutTimer,
  clearDisconnectTimer, scheduleDisconnectTimer,
  clearStartTimer, clearSessionTimer, scheduleSessionTimer,
  clearWaitlistTimer, scheduleWaitlistTimer,
  clearShowdownTimer, scheduleShowdownTimer,
} from './timerService.js';

// Базовые типы (Suit/Rank/Card/GamePhase/RoomStatus) — из канонического game/types.ts
// (§9.3-A: локальные копии убраны). Доменные типы ниже (Player/Room/...) пока локальны —
// server-internal расширение (socketId, таймеры, totalCommitted и т.д.). Публичные (GameState,
// InboxNotification) мигрируют на @poker-room/shared (npm workspaces §9.3-A, 2026-06-16).

export interface Player {
  id: string;            // userId из JWT (стабильный между переподключениями)
  socketId: string;      // текущий socket.id (обновляется на reconnect)
  username: string;
  displayName?: string;  // имя из Telegram (first_name) — показывается за столом вместо username
  chips: number;
  cards: Card[];
  isActive: boolean;
  isFolded: boolean;
  currentBet: number;
  position: number;
  avatar: string;
  disconnected: boolean;
  disconnectTimer: NodeJS.Timeout | null;
  timebank: number;        // оставшиеся секунды таймбанка (0 если отключён)
  handsAtTable: number;    // счётчик рук с момента посадки (для пополнения timebank каждые N рук)
  // Сумма всех вкладов игрока за раздачу (накопительно, в отличие от currentBet который
  // сбрасывается между улицами). Нужно для расчёта side pots при all-in нескольких игроков
  // с разными стеками. Сбрасывается в startGame.
  totalCommitted: number;
  // Стек на начало раздачи (снапшот в startGame до блайндов). Для PnL Δ людей в cleanupHand.
  handStartChips?: number;
  // Преференция авто-докупки стека (прислана клиентом через SET_AUTO_TOPUP). Применяется
  // между раздачами в cleanupHand → performAutoTopUp. Хранится санитизированной (см. setAutoTopUp).
  autoTopUp?: { enabled: boolean; thresholdBb: number; targetBb: number };
  // Подсказка комбинации/шансов включена клиентом (SET_HAND_HINT). Equity считаем только для
  // включивших (экономия CPU). По умолчанию off.
  wantsHint?: boolean;
  // Кэш текущего шанса на выигрыш (0..100), считается в updateEquities на смене улицы/состава.
  winChance?: number;
  // Индексы добровольно показанных карт (0/1) после раздачи (тап по своей карте на showdown).
  // Сбрасывается в startGame. Видны ВСЕМ (публичный показ).
  revealedCards?: number[];
  // HUD-lite: кэш VPIP/PFR по истории раздач (вычисляется при посадке).
  hudStats?: { vpip: number; pfr: number; hands: number };
  // Anti-collusion (доделка §10.6): IP/device-id на момент посадки — для запрета второго
  // места за тем же столом с того же IP/устройства (room.antiCollusionEnabled).
  networkInfo?: { ip: string; deviceId: string };
}

// PublicPlayer/GameState (локальные дубли shared.Player/shared.GameState) и
// TimebankConfig/TimebankSettings/RoomInfo (локальные дубли shared.*) убраны 2026-06-18
// (§9.3-A) — PublicPlayer/GameState были мёртвым кодом (нигде не импортировались, реальный
// транспорт идёт через gameStateSerializer.ts → shared.GameState), TimebankConfig/
// TimebankSettings/RoomInfo теперь ре-экспортируются из @poker-room/shared (см. импорт выше) —
// единственный источник правды, без риска расхождения полей.

export interface CreateRoomOptions {
  name: string;
  description?: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  password?: string;
  turnDurationSec: number;
  buyInMinBb: number;
  buyInMaxBb: number;
  // Если задан И allowPerTableOverride=true — используется как timebank-конфиг стола.
  // Иначе игнорируется (копируется глобал).
  timebank?: TimebankConfig;
  rake?: RakeConfig; // per-table рейк (percent/capBb). Не задан → рейк выключен.
  ante?: number; // анте в фишках, вносят все до блайндов (0/не задан = нет)
  sessionDurationHours?: number; // авто-закрытие стола через N часов (0/не задан = без ограничения)
  autoStartPlayers?: number; // автостарт раздачи от N игроков (2..maxPlayers, по умолчанию 2)
  sitOutTimeoutMin?: number; // сит-аут при дисконнекте: сколько минут игрок держит место (5..30, дефолт 30)
  waitlistDelayMin?: number; // задержка авто-посадки из очереди после освобождения места (2..10, дефолт 2)
  format?: GameFormat; // формат стола ('nlh' по умолчанию)
  clubId?: string;     // если задан — стол только для членов клуба
  pinned?: boolean;    // закрепить стол сверху лобби (только админ; проверяется в registerSocketHandlers)
  autoExtendSession?: boolean; // по истечении sessionDurationHours продлевать сессию повторно вместо закрытия
  // Доделка §10.6 (2026-06-26) — все автоматические, без согласия игрока на каждую раздачу.
  straddleEnabled?: boolean;
  bombPotEnabled?: boolean;
  doubleBoardEnabled?: boolean;
  rimtEnabled?: boolean;
  evCashoutEnabled?: boolean;
  noTurnNoShowEnabled?: boolean;
  antiCollusionEnabled?: boolean;
}

type JoinDeniedReason =
  | 'not-found'
  | 'wrong-password'
  | 'password-required'
  | 'full'
  | 'in-game'
  | 'kicked'
  | 'on-cooldown'
  | 'closed'
  | 'no-chips'
  | 'insufficient-bankroll'
  | 'invalid-buyin'
  | 'too-many-tables'
  | 'club-members-only'
  | 'anti-collusion';

// Мультитейблинг: максимум одновременно открытых столов на одного игрока.
const MAX_TABLES_PER_USER = 3;

const SOCKET_EVENTS = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  SET_HAND_HINT: 'setHandHint',
  SHOW_CARD: 'showCard',
  OBSERVE_ROOM: 'observeRoom',
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
  PLAYER_ACTION_BROADCAST: 'playerActionBroadcast',
  SEND_EMOJI: 'sendEmoji',
  EMOJI_BROADCAST: 'emojiBroadcast',
  BANKROLL_UPDATE: 'bankrollUpdate',
  ADMIN_PEEK_TOGGLE: 'adminPeekToggle',
  REQUEST_GAME_STATE: 'requestGameState',
  FORCE_DISCONNECT: 'forceDisconnect',
  JOIN_WAITLIST: 'joinWaitlist',
  LEAVE_WAITLIST: 'leaveWaitlist',
  SEAT_FROM_WAITLIST: 'seatFromWaitlist',
  SET_AUTO_TOPUP: 'setAutoTopUp',
  INBOX_NOTIFICATION: 'inboxNotification',
  RABBIT_HUNT: 'rabbitHunt',
  TOURNAMENT_TABLE_ASSIGNED: 'tournamentTableAssigned',
} as const;

const AUTO_START_MIN_PLAYERS = 2;
// Число итераций Монте-Карло для шанса на выигрыш. Баланс точность/CPU (±~1.5% при 1000).
// Считается только для активных игроков, включивших подсказку, и только на смене улицы/состава.
const EQUITY_ITERATIONS = 1000;
// Сит-аут: когда доходит ход отключённого игрока, он авто-фолдит/чекает почти мгновенно
// (не ждём полный turn-таймер и не тратим таймбанк) — стол не висит. Небольшая задержка
// нужна, чтобы клиенты успели отрисовать ход и анимацию фолда.
const SITOUT_AUTOACT_MS = 1500; // автостарт всегда от 2 игроков (per-table настройка не делается, см. CLAUDE.md)

interface GameSettings {
  turnDurationMs: number;
  autostartDelayMs: number;
  defaultPlayerChips: number;
  timebank: TimebankSettings;
  botMode: BotModeSettings;
  paidFeatures: PaidFeaturesSettings;
  payments: PaymentsSettings;
  responsibleGambling: ResponsibleGamblingSettings;
}

// Платные фичи (ROADMAP §10.12, новая админ-вкладка «Платные фичи»). Сейчас одна — Rabbit Hunting.
export interface PaidFeaturesSettings {
  rabbitHunt: {
    enabled: boolean;
    mode: 'fixed' | 'percent'; // fixed — фикс. сумма в фишках; percent — % от банка раздачи
    fixedAmount: number;       // фишки (центы), режим fixed
    percent: number;           // 0..100, режим percent
  };
}


const DEFAULT_TIMEBANK: TimebankSettings = {
  enabled: true,
  startSec: 30,
  bonusSec: 10,
  bonusEveryHands: 10,
  capSec: 60,
  allowPerTableOverride: false,
};

const DEFAULT_BOT_MODE: BotModeSettings = {
  enabled: false,
  peekMode: 'river',
  tablesPerLevel: 1,
  botsPerTable: 6,
  defaultBuyInBb: 100,
  refillIntervalMs: 120000,
};

const DEFAULT_PAID_FEATURES: PaidFeaturesSettings = {
  rabbitHunt: { enabled: false, mode: 'percent', fixedAmount: 100, percent: 5 },
};

// Защита игрока — opt-out, не opt-in: по умолчанию все пункты доступны, админ может отключить.
const DEFAULT_RESPONSIBLE_GAMBLING: ResponsibleGamblingSettings = {
  depositLimitEnabled: true,
  lossLimitEnabled: true,
  sessionTimeLimitEnabled: true,
  selfExclusionEnabled: true,
  timeoutEnabled: true,
};

// Платежи (ROADMAP §11.1) — крипто-депозит/вывод USDT, выключено по умолчанию (требует
// секретов в env — DEPOSIT_SEED_MNEMONIC_*/HOT_WALLET_PRIVATE_KEY_*, см. config.ts).
const DEFAULT_PAYMENTS: PaymentsSettings = {
  enabled: false,
  exchangeRateCentsPerUsdt: 10000, // 1 USDT = 100.00 фишек по умолчанию
  minDepositUsdt: 5,
  maxDepositUsdt: 10000,
  minWithdrawalUsdt: 5,
  maxWithdrawalUsdt: 5000,
  chains: {
    tron: { enabled: true, minConfirmations: 19 },
    ethereum: { enabled: true, minConfirmations: 12 },
    bsc: { enabled: true, minConfirmations: 15 },
  },
};

const DEFAULT_SETTINGS: GameSettings = {
  turnDurationMs: 30000,
  autostartDelayMs: 10000,
  defaultPlayerChips: 1000,
  timebank: { ...DEFAULT_TIMEBANK },
  botMode: { ...DEFAULT_BOT_MODE },
  paidFeatures: { rabbitHunt: { ...DEFAULT_PAID_FEATURES.rabbitHunt } },
  payments: { ...DEFAULT_PAYMENTS, chains: { ...DEFAULT_PAYMENTS.chains } },
  responsibleGambling: { ...DEFAULT_RESPONSIBLE_GAMBLING },
};

const LOBBY_ROOM = 'lobby';

export interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  maxPlayers: number;
  passwordHash: string | null;
  status: RoomStatus;
  players: Map<string, Player>;
  communityCards: Card[];
  deck: Card[];
  pot: number;
  currentBet: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  phase: GamePhase;
  smallBlind: number;
  bigBlind: number;
  actionsThisRound: Set<string>;
  lastRaiseSize: number;        // размер последнего полного raise (для minRaiseTo §5.1)
  lockedCallers: Set<string>;   // игроки, которым нельзя re-raise после incomplete all-in (§5.2)
  startTimer: NodeJS.Timeout | null;
  startCountdownEndsAt: number | null;
  turnTimer: NodeJS.Timeout | null;
  turnEndsAt: number | null;
  turnDurationMs: number; // per-table override таймера хода (мс)
  buyInMinBb: number; // нижняя граница бай-ина в больших блайндах
  buyInMaxBb: number; // верхняя граница бай-ина в больших блайндах
  timebank: TimebankConfig; // per-table конфиг таймбанка (копия глобал или override)
  timebankTimer: NodeJS.Timeout | null;     // setTimeout для phase 2 (таймбанк) — auto-fold
  turnTimebankEndsAt: number | null;        // timestamp окончания таймбанк-фазы
  turnTimebankStartedAt: number | null;     // когда стартовал таймбанк (для списания elapsed)
  turnTimebankPlayerId: string | null;      // чей таймбанк сейчас идёт (страховка от гонок)
  showdownTimer: NodeJS.Timeout | null;     // таймер показа шоудауна перед cleanupHand (5с)
  showdownEndsAt: number | null;            // timestamp окончания окна шоудауна
  lastProgressAt: number;                   // timestamp последнего реального продвижения раздачи (watchdog §11.x)
  isBotTable: boolean;                      // автоматически созданный стол режима ботов
  botTableLevel?: 'micro' | 'low' | 'mid';  // профиль уровня (для refill)
  clubId?: string;                          // если задан — стол только для членов клуба
  handIndex: number;                        // счётчик раздач за столом (для seeded RNG ботов)
  rake: RakeConfig;                         // per-table рейк (percent=0 → выключен)
  lastHandRake?: number;                    // рейк, удержанный в последней раздаче (для статистики)
  lastHandWinners?: string[];               // победители последней раздачи (для атрибуции баунти при бaсте, см. onTournamentBust)
  actionLog?: HandAction[];                 // лог действий текущей раздачи (для replay в истории)
  ante: number;                             // анте в фишках (0 = нет)
  format: GameFormat;                       // формат игры ('nlh' | 'shortdeck')
  autoStartPlayers: number;                 // автостарт раздачи от N игроков
  sessionDurationHours: number;             // длительность сессии в часах (0 = без ограничения)
  sessionEndsAt: number | null;             // timestamp авто-закрытия (null = без ограничения)
  sessionTimer: NodeJS.Timeout | null;      // таймер авто-закрытия стола
  autoExtendSession: boolean;               // по истечении sessionEndsAt продлевать на sessionDurationHours повторно вместо закрытия
  pinned: boolean;                          // закреплён сверху лобби (admin-only при создании)
  sitOutTimeoutMin: number;                 // сит-аут при дисконнекте: минут держим место до кика (5..30)
  kickCooldowns: Map<string, number>;       // userId → timestamp, до которого вход за стол закрыт (временный кик админом)
  waitlistDelayMin: number;                 // задержка авто-посадки из очереди после освобождения места (2..10)
  waitlist: WaitlistEntry[];                // очередь на полный стол (порядок = приоритет посадки)
  waitlistTimer: NodeJS.Timeout | null;     // таймер задержки до посадки следующего из очереди
  waitlistPromoteEndsAt: number | null;     // timestamp ближайшей авто-посадки (для возможного отсчёта)
  equitySig?: string;                       // сигнатура (фаза+борд+активные+желающие) — мемоизация updateEquities
  observers: Map<string, { userId: string; username: string }>; // socketId → {userId, username}
  // Платная фича Rabbit Hunting (§10.12). Окно — только пока phase==='showdown' (cleanupHand сбрасывает).
  rabbitHuntCards?: Card[];      // карты, которые пришли бы (undefined = не применимо к этой раздаче)
  rabbitHuntPrice?: number;      // цена раскрытия для ЭТОЙ раздачи (фишки)
  rabbitHuntPaidBy: Set<string>; // кто уже оплатил и видит карты в этом окне
  // Турнирный стол (§10 «Турниры»): если задан — TournamentManager владеет жизненным циклом
  // (блайнды по уровням, элиминация без возврата в банкролл — см. autoLeaveBrokePlayers/onTournamentBust).
  tournamentId?: string;
  // Доделка §10.6 (2026-06-26) — спец-режимы стола, см. docs/ROADMAP.md и план реализации.
  straddleEnabled: boolean;
  bombPotEnabled: boolean;
  doubleBoardEnabled: boolean;
  rimtEnabled: boolean;
  evCashoutEnabled: boolean;
  noTurnNoShowEnabled: boolean;
  antiCollusionEnabled: boolean;
  communityCardsB: Card[] | null; // второй борд (Double Board) или второй прогон (RIMT)
  deckB: Card[] | null;           // форк остатка деки под второй борд/прогон
  settlementMode?: 'rimt' | 'evCashout'; // раздача решена досрочно — см. resolveEarlyDecided
}

// Запись в очереди на полный стол: кто, под каким именем и с каким бай-ином сядет автоматически.
export interface WaitlistEntry {
  userId: string;
  username: string;
  buyInAmount: number; // сумма, выбранная при вступлении в очередь; спишется при посадке
  addedAt: number;
}

export class GameManager implements GameManagerForBots {
  private io: Server;
  private rooms: Map<string, Room>;
  private settings: GameSettings;
  // Admin-peek: набор socketId, у которых включён режим «глаз админа».
  // Заполняется через setAdminPeek (с проверкой роли в index.ts) и чистится на disconnect.
  private adminPeekSockets: Set<string>;
  // BotManager — оркестрация ботов (см. game/BotManager.ts). Создаётся в конструкторе.
  private botManager: BotManager;
  // Сервис банкролла — единственная точка записи chips юзеров (§0.4). Зависимости инжектятся.
  private bankroll: BankrollService;
  // Колбэк записи статистики раздачи (инжектится из index.ts). В тестах не выставлен → не пишет файл.
  statsRecorder?: (rec: HandStatRecord) => void;
  // Колбэк лога открытия стола (инжектится из index.ts). В тестах не выставлен → не пишет файл.
  roomEventRecorder?: (rec: RoomEventRecord) => void;
  // Колбэк записи снимка раздачи в историю (инжектится из index.ts). В тестах не выставлен → не пишет файл.
  handRecorder?: (rec: Omit<HandHistoryRecord, 'id'>) => void;
  // Колбэк лога восстановлений зависших столов (инжектится из index.ts, см. tableWatchdog.ts).
  // В тестах не выставлен → не пишет файл.
  frozenTableRecorder?: (rec: FrozenTableRecord) => void;
  // Колбэк элиминации игрока на турнирном столе (инжектится TournamentManager из index.ts).
  // Вызывается ВМЕСТО обычного банкролл-возврата, когда у игрока на столе с room.tournamentId
  // обнуляется стек (см. autoLeaveBrokePlayers) — турнирные фишки не кэшаются, место просто
  // освобождается, а финишную позицию/выплату считает TournamentManager. killerIds — игроки,
  // выигравшие раздачу, в которой произошёл бaст (для баунти, см. room.lastHandWinners); пустой
  // массив при форфейте (добровольный выход/дисконнект — никто не выигрывал раздачу). В тестах не выставлен.
  onTournamentBust?: (roomId: string, userId: string, killerIds: string[]) => void;
  // Интервал периодической проверки зависших столов — стартует явно через startTableWatchdog()
  // (не из конструктора, см. комментарий там).
  private watchdogTimer: NodeJS.Timeout | null = null;
  // Лимит времени сессии (ROADMAP §11.2) — та же причина явного старта, что у watchdogTimer.
  private sessionTimeTimer: NodeJS.Timeout | null = null;
  private sessionTimeWatchdog = new SessionTimeWatchdog();

  constructor(io: Server) {
    this.io = io;
    this.rooms = new Map();
    this.adminPeekSockets = new Set();
    // botManager создаётся ниже; deps ленивые (читают this.botManager в runtime) — порядок ок.
    this.bankroll = new BankrollService({
      isBot: (id) => this.isBot(id),
      getBotChips: (id) => this.botManager?.getBot(id)?.chips ?? null,
      persistBotChips: (id, chips) => this.botManager?.persistBotChips(id, chips),
      notify: (id, chips) => this.notifyBankroll(id, chips),
    });
    this.settings = this.loadSettings();
    this.loadRoomsSnapshot();
    // BotManager создаётся после loadSettings (нужен settings.botMode).
    // ВАЖНО: при рестарте сервера снапшот восстановит бот-столы пустыми (без игроков),
    // поэтому мы удаляем их из rooms перед инициализацией BotManager — он пересоздаст заново.
    this.purgeBotTablesFromSnapshot();
    this.botManager = new BotManager(this, this.settings.botMode);
    if (this.settings.botMode.enabled) {
      // Запускаем режим сразу — BotManager создаст автостолы.
      this.botManager.enableMode();
    }
    // Восстановление активных раздач (§9.2) — НЕ здесь: index.ts проставляет
    // statsRecorder/roomEventRecorder/handRecorder сразу после `new GameManager(io)`,
    // restoreActiveHands() должен вызываться явно ПОСЛЕ этого (см. restoreActiveHands).
  }

  // Удалить из rooms все бот-столы, восстановленные из snapshot'а (после рестарта).
  // BotManager заново создаст столы и посадит ботов.
  private purgeBotTablesFromSnapshot(): void {
    const toDelete: string[] = [];
    this.rooms.forEach((r, id) => {
      if (r.isBotTable) toDelete.push(id);
    });
    toDelete.forEach((id) => this.rooms.delete(id));
    if (toDelete.length > 0) {
      console.log(`🤖 Purged ${toDelete.length} bot table(s) from snapshot — will recreate`);
      this.saveRoomsSnapshot();
    }
  }

  // Включить/выключить peek для конкретного сокета. Проверку роли делает caller (index.ts).
  setAdminPeek(socketId: string, enabled: boolean): void {
    if (enabled) this.adminPeekSockets.add(socketId);
    else this.adminPeekSockets.delete(socketId);
  }

  // Активен ли peek у сокета (для requestGameState и т.п.)
  isAdminPeekSocket(socketId: string): boolean {
    return this.adminPeekSockets.has(socketId);
  }

  // Очистить peek при дисконнекте — иначе Set растёт навсегда
  clearAdminPeek(socketId: string): void {
    this.adminPeekSockets.delete(socketId);
  }

  addObserver(roomId: string, socketId: string, userId: string, username: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.observers.set(socketId, { userId, username });
    this.broadcastGameState(roomId);
  }

  removeObserverSocket(socketId: string): void {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.observers.has(socketId)) {
        room.observers.delete(socketId);
        this.broadcastGameState(roomId);
        break;
      }
    }
  }

  // Снимок комнат — только метаданные (без игроков и состояния раздачи).
  // При рестарте сервера комнаты возвращаются пустыми, игроки переподключаются заново.
  private loadRoomsSnapshot(): void {
    try {
      const snapshots = readJSON('rooms.json') as Array<{
        id: string; name: string; createdBy: string; maxPlayers: number;
        smallBlind: number; bigBlind: number; passwordHash: string | null;
        description?: string;
        turnDurationMs?: number;
        buyInMinBb?: number;
        buyInMaxBb?: number;
        timebank?: TimebankConfig;
        isBotTable?: boolean;
        botTableLevel?: 'micro' | 'low' | 'mid';
      }>;
      if (!Array.isArray(snapshots)) return;
      snapshots.forEach(s => {
        // Старые снапшоты без turnDurationMs — берём текущий глобальный settings
        const turnMs = s.turnDurationMs ?? this.settings.turnDurationMs;
        // Старые снапшоты без бай-ина — дефолтный диапазон 20-100 BB
        const buyMin = s.buyInMinBb ?? 20;
        const buyMax = Math.max(buyMin, s.buyInMaxBb ?? 100);
        // Старые снапшоты без timebank — копируем глобальный (без allowPerTableOverride)
        const tb: TimebankConfig = s.timebank ?? toRoomTimebank(this.settings.timebank);
        this.rooms.set(s.id, makeRoom({
          id: s.id,
          name: s.name,
          description: typeof s.description === 'string' ? s.description.slice(0, 200) : '',
          createdBy: s.createdBy,
          maxPlayers: s.maxPlayers,
          passwordHash: s.passwordHash,
          smallBlind: s.smallBlind,
          bigBlind: s.bigBlind,
          turnDurationMs: turnMs,
          buyInMinBb: buyMin,
          buyInMaxBb: buyMax,
          timebank: tb,
          rake: normalizeRake((s as { rake?: RakeConfig }).rake),
          ante: Math.max(0, Math.floor((s as { ante?: number }).ante ?? 0)),
          format: (s as { format?: GameFormat }).format === 'shortdeck' ? 'shortdeck' : 'nlh',
          autoStartPlayers: Math.max(2, Math.floor((s as { autoStartPlayers?: number }).autoStartPlayers ?? AUTO_START_MIN_PLAYERS)),
          sessionDurationHours: Math.max(0, Math.floor((s as { sessionDurationHours?: number }).sessionDurationHours ?? 0)),
          sessionEndsAt: (s as { sessionEndsAt?: number }).sessionEndsAt ?? null,
          sitOutTimeoutMin: Math.max(5, Math.min(30, Math.floor((s as { sitOutTimeoutMin?: number }).sitOutTimeoutMin ?? 30))),
          waitlistDelayMin: Math.max(2, Math.min(10, Math.floor((s as { waitlistDelayMin?: number }).waitlistDelayMin ?? 2))),
          isBotTable: !!s.isBotTable,
          botTableLevel: s.botTableLevel,
          clubId: (s as { clubId?: string }).clubId,
          pinned: !!(s as { pinned?: boolean }).pinned,
          autoExtendSession: !!(s as { autoExtendSession?: boolean }).autoExtendSession,
          tournamentId: (s as { tournamentId?: string }).tournamentId,
          straddleEnabled: !!(s as { straddleEnabled?: boolean }).straddleEnabled,
          bombPotEnabled: !!(s as { bombPotEnabled?: boolean }).bombPotEnabled,
          doubleBoardEnabled: !!(s as { doubleBoardEnabled?: boolean }).doubleBoardEnabled,
          rimtEnabled: !!(s as { rimtEnabled?: boolean }).rimtEnabled,
          evCashoutEnabled: !!(s as { evCashoutEnabled?: boolean }).evCashoutEnabled,
          noTurnNoShowEnabled: !!(s as { noTurnNoShowEnabled?: boolean }).noTurnNoShowEnabled,
          antiCollusionEnabled: !!(s as { antiCollusionEnabled?: boolean }).antiCollusionEnabled,
        }));
        const restored = this.rooms.get(s.id);
        if (restored && restored.sessionEndsAt) this.scheduleSessionClose(restored);
      });
      if (snapshots.length > 0) {
        console.log(`Restored ${snapshots.length} room(s) from snapshot`);
      }
    } catch {
      // Файла нет или повреждён — стартуем без комнат
    }
  }

  private saveRoomsSnapshot(): void {
    const snapshots = Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdBy: r.createdBy,
      maxPlayers: r.maxPlayers,
      smallBlind: r.smallBlind,
      bigBlind: r.bigBlind,
      passwordHash: r.passwordHash,
      turnDurationMs: r.turnDurationMs,
      buyInMinBb: r.buyInMinBb,
      buyInMaxBb: r.buyInMaxBb,
      timebank: r.timebank,
      rake: r.rake,
      ante: r.ante,
      format: r.format,
      autoStartPlayers: r.autoStartPlayers,
      sessionDurationHours: r.sessionDurationHours,
      sessionEndsAt: r.sessionEndsAt,
      sitOutTimeoutMin: r.sitOutTimeoutMin,
      waitlistDelayMin: r.waitlistDelayMin,
      isBotTable: r.isBotTable,
      botTableLevel: r.botTableLevel,
      clubId: r.clubId,
      pinned: r.pinned,
      autoExtendSession: r.autoExtendSession,
      tournamentId: r.tournamentId,
      straddleEnabled: r.straddleEnabled,
      bombPotEnabled: r.bombPotEnabled,
      doubleBoardEnabled: r.doubleBoardEnabled,
      rimtEnabled: r.rimtEnabled,
      evCashoutEnabled: r.evCashoutEnabled,
      noTurnNoShowEnabled: r.noTurnNoShowEnabled,
      antiCollusionEnabled: r.antiCollusionEnabled,
    }));
    try {
      writeJSON('rooms.json', snapshots);
    } catch {
      // best-effort снапшот — следующий saveRoomsSnapshot перезапишет
    }
    this.persistActiveHands();
  }

  // Восстановление активных раздач из active-hands.json (§9.2) — вызывается ОДИН раз после
  // конструктора (this.rooms уже заполнен loadRoomsSnapshot/purgeBotTablesFromSnapshot).
  // Применяем снимки на уже созданные «пустые» комнаты, затем для каждой — возобновляем
  // ровно тем же путём, которым GameManager обычно продолжает раздачу:
  //  - очередь не пуста → scheduleWaitlistPromotion (свежий полный таймер, как обычно)
  //  - waiting (игроки сидят, раздача не шла) → scheduleAutoStart
  //  - showdown → cleanupHand немедленно (5с окно показа заведомо истекло за даунтайм)
  //  - иначе (preflop/flop/turn/river) → emitCurrentTurn — текущий игрок disconnected=true
  //    (см. applyActiveHandSnapshot), сработает обычная сит-аут ветка (быстрый auto-act).
  // Публичный — вызывается явно из index.ts ПОСЛЕ statsRecorder/roomEventRecorder/handRecorder
  // (не из конструктора: раньше был отложен через setImmediate, но это давало вызову срабатывать
  // в случайный момент под vi.useFakeTimers() в НЕ относящихся к рестарту тестах — любой
  // vi.advanceTimersByTime() флашит и виртуальные setImmediate).
  restoreActiveHands(): void {
    let snapshots: ReturnType<typeof serializeActiveHand>[];
    try {
      snapshots = readJSON('active-hands.json') as ReturnType<typeof serializeActiveHand>[];
      if (!Array.isArray(snapshots)) return;
    } catch {
      return; // файла нет или повреждён — ничего восстанавливать
    }

    const restoredRoomIds: string[] = [];
    snapshots.forEach((snap) => {
      if (!snap) return;
      const room = this.rooms.get(snap.roomId);
      if (!room || room.isBotTable) return;
      applyActiveHandSnapshot(room, snap);
      restoredRoomIds.push(snap.roomId);
    });

    if (restoredRoomIds.length > 0) {
      console.log(`Restored ${restoredRoomIds.length} active hand(s) from snapshot`);
    }

    restoredRoomIds.forEach((roomId) => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      if (room.waitlist.length > 0) this.scheduleWaitlistPromotion(roomId);
      if (room.status === 'waiting') {
        this.scheduleAutoStart(roomId);
      } else if (room.phase === 'showdown') {
        this.cleanupHand(roomId);
      } else {
        this.emitCurrentTurn(roomId);
      }
    });
  }

  // Watchdog «зависших» столов (см. tableWatchdog.ts: getFreezeInfo). Раздача идёт, но дедлайн
  // собственного таймера сервера (ход/таймбанк/шоудаун, либо просто last-progress) просрочен
  // больше чем на FREEZE_THRESHOLD_MS — значит callback, который должен был продвинуть раздачу,
  // не сработал (исключение/баг где-то в цепочке). Восстановление — мягкое, той же логикой, что
  // и при рестарте сервера (restoreActiveHands): карты/банк/стеки НЕ трогаем, просто заново
  // запускаем механизм хода (emitCurrentTurn) либо досрочно завершаем застрявший показ шоудауна
  // (cleanupHand). Бот-столы пропускаются (getFreezeInfo).
  private checkFrozenTables(): void {
    const now = Date.now();
    this.rooms.forEach((room) => {
      const { frozen, overdueMs } = getFreezeInfo(room, now);
      if (!frozen) return;
      console.warn(
        `⚠️ [watchdog] стол "${room.name}" (${room.id}) завис в фазе ${room.phase} — ` +
        `восстанавливаю (просрочка ${Math.round(overdueMs / 1000)}с)`,
      );
      this.frozenTableRecorder?.({ t: now, roomId: room.id, name: room.name, phase: room.phase, overdueMs });
      clearTurnTimers(room);
      clearShowdownTimer(room);
      room.lastProgressAt = now;
      if (room.phase === 'showdown') {
        this.cleanupHand(room.id);
      } else {
        this.emitCurrentTurn(room.id);
      }
    });
  }

  // Запускает периодическую проверку зависших столов. Вызывается явно из index.ts (как
  // restoreActiveHands) — НЕ из конструктора, чтобы не плодить лишний setInterval в тестах,
  // которые создают GameManager пачками и продвигают fake-таймеры на часы вперёд (это могло бы
  // спровоцировать ложные срабатывания watchdog'а в тестах, не имеющих к нему отношения).
  startTableWatchdog(intervalMs = 15_000): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => this.checkFrozenTables(), intervalMs);
  }

  // Вызывается из registerSocketHandlers при подключении/полном отключении юзера (см. там же
  // hasOtherActiveSocket — мультитейблинг не должен сбрасывать отсчёт сессии раньше времени).
  trackUserConnected(userId: string): void {
    this.sessionTimeWatchdog.onConnect(userId);
  }
  trackUserDisconnected(userId: string): void {
    this.sessionTimeWatchdog.onDisconnect(userId);
  }

  // Периодическая проверка лимита времени сессии — только предупреждение (ROADMAP §11.2),
  // без форс-логаута. Та же причина явного старта из index.ts, что у startTableWatchdog.
  startSessionTimeWatchdog(intervalMs = 60_000): void {
    if (this.sessionTimeTimer) clearInterval(this.sessionTimeTimer);
    this.sessionTimeTimer = setInterval(() => {
      if (!this.settings.responsibleGambling.sessionTimeLimitEnabled) return;
      const crossed = this.sessionTimeWatchdog.tick(
        Date.now(),
        (userId) => getResponsibleGamblingState(userId).sessionTimeLimitMinutes,
      );
      for (const userId of crossed) {
        this.sendInboxNotification(userId, 'rg-warning', 'Вы превысили установленный лимит времени сессии.');
      }
    }, intervalMs);
  }

  // Снимок активных раздач (deck/pot/players/phase/...) — отдельно от метаданных rooms.json
  // (ROADMAP §9.2). Бот-столы и пустые комнаты не пишутся (serializeActiveHand → null).
  // Вызывается из saveRoomsSnapshot (создание/удаление комнат) и broadcastGameState
  // (любое значимое изменение раздачи) — см. restoreActiveHands для восстановления.
  private persistActiveHands(): void {
    const snapshots = Array.from(this.rooms.values())
      .map(r => serializeActiveHand(r))
      .filter((s): s is NonNullable<typeof s> => s !== null);
    try {
      writeJSON('active-hands.json', snapshots);
    } catch {
      // best-effort — следующая запись перезапишет
    }
  }

  private loadSettings(): GameSettings {
    try {
      const data = readJSON('settings.json') as Partial<GameSettings>;
      // Глубокий merge для вложенного timebank/paidFeatures/payments блока (иначе spread затрёт частично заданный)
      const tb: TimebankSettings = { ...DEFAULT_TIMEBANK, ...(data.timebank ?? {}) };
      const pf: PaidFeaturesSettings = {
        rabbitHunt: { ...DEFAULT_PAID_FEATURES.rabbitHunt, ...(data.paidFeatures?.rabbitHunt ?? {}) },
      };
      const pm: PaymentsSettings = {
        ...DEFAULT_PAYMENTS,
        ...(data.payments ?? {}),
        chains: { ...DEFAULT_PAYMENTS.chains, ...(data.payments?.chains ?? {}) },
      };
      const rg: ResponsibleGamblingSettings = { ...DEFAULT_RESPONSIBLE_GAMBLING, ...(data.responsibleGambling ?? {}) };
      return { ...DEFAULT_SETTINGS, ...data, timebank: tb, paidFeatures: pf, payments: pm, responsibleGambling: rg };
    } catch {
      return {
        ...DEFAULT_SETTINGS,
        timebank: { ...DEFAULT_TIMEBANK },
        paidFeatures: { rabbitHunt: { ...DEFAULT_PAID_FEATURES.rabbitHunt } },
        payments: { ...DEFAULT_PAYMENTS, chains: { ...DEFAULT_PAYMENTS.chains } },
        responsibleGambling: { ...DEFAULT_RESPONSIBLE_GAMBLING },
      };
    }
  }

  // Создать комнату
  createRoom(options: CreateRoomOptions, createdBy: string): { roomId: string } | { error: string } {
    const validationError = validateCreateOptions(options);
    if (validationError) {
      return { error: validationError };
    }

    // Клиент присылает clubId сам (как и pinned/format) — не доверяем без проверки (§0.13):
    // создавать клубный стол может только участник этого клуба.
    if (options.clubId) {
      const club = readClubs().find(c => c.id === options.clubId);
      if (!club || !club.members.some(m => m.userId === createdBy)) {
        return { error: 'club-membership-required' };
      }
    }

    // Timebank: override только если глобально разрешено И клиент явно прислал конфиг.
    // Иначе — копируем глобал.
    let roomTimebank: TimebankConfig;
    if (options.timebank && this.settings.timebank.allowPerTableOverride) {
      const tbErr = validateTimebankConfig(options.timebank);
      if (tbErr) return { error: tbErr };
      roomTimebank = { ...options.timebank };
    } else {
      roomTimebank = toRoomTimebank(this.settings.timebank);
    }

    const roomId = nanoid(10);
    const password = options.password && options.password.length > 0 ? options.password : null;

    this.rooms.set(roomId, makeRoom({
      id: roomId,
      name: options.name,
      description: options.description ?? '',
      createdBy,
      maxPlayers: options.maxPlayers,
      passwordHash: password ? bcrypt.hashSync(password, 10) : null,
      smallBlind: options.smallBlind,
      bigBlind: options.bigBlind,
      turnDurationMs: options.turnDurationSec * 1000,
      buyInMinBb: options.buyInMinBb,
      buyInMaxBb: options.buyInMaxBb,
      timebank: roomTimebank,
      rake: normalizeRake(options.rake),
      ante: Math.max(0, Math.min(options.bigBlind, Math.floor(options.ante ?? 0))),
      format: options.format === 'shortdeck' ? 'shortdeck' : 'nlh',
      autoStartPlayers: Math.max(2, Math.min(options.maxPlayers, Math.floor(options.autoStartPlayers ?? AUTO_START_MIN_PLAYERS))),
      sessionDurationHours: Math.max(0, Math.min(24, Math.floor(options.sessionDurationHours ?? 0))),
      sitOutTimeoutMin: Math.max(5, Math.min(30, Math.floor(options.sitOutTimeoutMin ?? 30))),
      waitlistDelayMin: Math.max(2, Math.min(10, Math.floor(options.waitlistDelayMin ?? 2))),
      isBotTable: false,
      clubId: options.clubId,
      pinned: !!options.pinned,
      autoExtendSession: !!options.autoExtendSession,
      straddleEnabled: !!options.straddleEnabled,
      bombPotEnabled: !!options.bombPotEnabled,
      doubleBoardEnabled: !!options.doubleBoardEnabled,
      rimtEnabled: !!options.rimtEnabled,
      evCashoutEnabled: !!options.evCashoutEnabled,
      noTurnNoShowEnabled: !!options.noTurnNoShowEnabled,
      antiCollusionEnabled: !!options.antiCollusionEnabled,
    }));

    // Авто-закрытие по длительности сессии (если задана)
    const created = this.rooms.get(roomId)!;
    if (created.sessionDurationHours > 0) {
      created.sessionEndsAt = Date.now() + created.sessionDurationHours * 3600 * 1000;
      this.scheduleSessionClose(created);
    }

    // Лог открытия стола (метрика «столов открыто» в админ-вкладке «Данные»). Только люди-столы.
    this.roomEventRecorder?.({ t: Date.now(), roomId, name: options.name, createdBy });

    this.notifyLobbyChange();
    this.saveRoomsSnapshot();
    return { roomId };
  }

  // Создать игровой стол для турнира (TournamentManager). В отличие от createRoom — без
  // валидации пользовательского ввода/клуба/бай-ина: вызывается только сервером с уже
  // проверенными параметрами турнира. Стол не появляется в обычном кэш-лобби (getRoomList).
  createTournamentTable(params: {
    tournamentId: string;
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    format: GameFormat;
  }): string {
    const roomId = nanoid(10);
    this.rooms.set(roomId, makeRoom({
      id: roomId,
      name: params.name,
      description: '',
      createdBy: 'system:tournament',
      maxPlayers: params.maxPlayers,
      passwordHash: null,
      smallBlind: params.smallBlind,
      bigBlind: params.bigBlind,
      turnDurationMs: this.settings.turnDurationMs,
      buyInMinBb: 0, // не используется — посадка через seatTournamentPlayer, не addPlayer
      buyInMaxBb: 0,
      timebank: toRoomTimebank(this.settings.timebank),
      rake: { percent: 0, capBb: 0 }, // турниры без рейка в v1
      ante: 0,
      format: params.format,
      autoStartPlayers: 2, // раздачи продолжаются, пока живы ≥2 — первый старт вызывает TournamentManager явно
      sessionDurationHours: 0,
      sitOutTimeoutMin: 30,
      waitlistDelayMin: 2,
      isBotTable: false,
      tournamentId: params.tournamentId,
    }));
    this.saveRoomsSnapshot();
    return roomId;
  }

  // Посадить игрока за турнирный стол (TournamentManager). Минует банкролл — турнирные фишки
  // не из банкролла (бай-ин уже списан один раз при регистрации). Если игрок сейчас онлайн —
  // подключает его сокет к комнате и шлёт TOURNAMENT_TABLE_ASSIGNED для навигации клиента.
  seatTournamentPlayer(roomId: string, userId: string, username: string, chips: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.size >= room.maxPlayers || room.players.has(userId)) return false;

    const sock = this.findUserSocket(userId);
    const player = createPlayer({
      id: userId,
      socketId: sock?.id ?? '',
      username,
      chips,
      position: room.players.size,
      isFolded: false,
      timebank: room.timebank.enabled ? room.timebank.startSec : 0,
    });
    try {
      const users = readJSON('users.json') as Array<{ id: string; displayName?: string; avatarSeed?: string }>;
      const u = users.find((x) => x.id === userId);
      if (u?.displayName) player.displayName = u.displayName;
      if (u?.avatarSeed) player.avatar = u.avatarSeed;
    } catch {
      // users.json недоступен — садимся без displayName/avatar, не блокируем посадку
    }
    room.players.set(userId, player);
    if (sock) {
      sock.join(roomId);
      sock.emit(SOCKET_EVENTS.TOURNAMENT_TABLE_ASSIGNED, { tournamentId: room.tournamentId, roomId });
    }
    return true;
  }

  // Повысить уровень блайндов на турнирном столе (TournamentManager, по общему таймеру уровней).
  setTableBlinds(roomId: string, smallBlind: number, bigBlind: number, ante: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.smallBlind = smallBlind;
    room.bigBlind = bigBlind;
    room.ante = ante;
    this.broadcastGameState(roomId);
  }

  // Можно ли сейчас трогать стол (двигать игрока/закрывать) — только между раздачами,
  // иначе перенос игрока мид-хэнд ломает порядок/банк/карты раздачи на исходном столе.
  isTableSafeToRebalance(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return !!room && room.status === 'waiting';
  }

  // Перенести игрока между турнирными столами (балансировка/консолидация, TournamentManager).
  // Не трогает банкролл — переносится тот же Player-объект со стеком как есть.
  movePlayerToTable(fromRoomId: string, toRoomId: string, userId: string): boolean {
    const fromRoom = this.rooms.get(fromRoomId);
    const toRoom = this.rooms.get(toRoomId);
    if (!fromRoom || !toRoom) return false;
    if (fromRoom.status !== 'waiting') return false;
    const player = fromRoom.players.get(userId);
    if (!player) return false;
    if (toRoom.players.size >= toRoom.maxPlayers) return false;

    fromRoom.players.delete(userId);
    player.position = toRoom.players.size;
    toRoom.players.set(userId, player);

    const sock = this.findUserSocket(userId);
    if (sock) {
      sock.leave(fromRoomId);
      sock.join(toRoomId);
      sock.emit(SOCKET_EVENTS.TOURNAMENT_TABLE_ASSIGNED, { tournamentId: toRoom.tournamentId, roomId: toRoomId });
    }

    this.broadcastGameState(fromRoomId);
    this.broadcastGameState(toRoomId);
    this.scheduleAutoStart(toRoomId);
    return true;
  }

  // Закрыть турнирный стол после завершения турнира (без возврата фишек — выплаты по результатам
  // считает и кредитует TournamentManager отдельно через tournamentBankroll).
  closeTournamentTable(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    clearStartTimer(room);
    clearTurnTimers(room);
    clearShowdownTimer(room);
    clearWaitlistTimer(room);
    this.rooms.delete(roomId);
    this.notifyLobbyChange();
    this.saveRoomsSnapshot();
  }

  // Проверка возможности войти в комнату.
  // Если userId уже в players — это реконнект, пропускаем все проверки кроме существования.
  // Late entry: если комната в playing-фазе, новый игрок добавляется как folded на текущую
  // раздачу и получит карты со следующей (см. addPlayer).
  canJoinRoom(roomId: string, userId: string, password?: string, buyInAmount?: number, networkInfo?: { ip: string; deviceId: string }): JoinDeniedReason | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'not-found';
    if (room.players.has(userId)) return null; // реконнект в уже открытый стол — без лимита
    if (room.clubId) {
      const clubs = readClubs();
      const club = clubs.find(c => c.id === room.clubId);
      if (!club || !club.members.some(m => m.userId === userId)) return 'club-members-only';
    }
    // Мультитейблинг: не больше MAX_TABLES_PER_USER одновременно открытых столов.
    if (this.countUserTables(userId) >= MAX_TABLES_PER_USER) return 'too-many-tables';
    return this.seatDeny(room, userId, password, buyInAmount, true, networkInfo);
  }

  // Сколько столов уже занято этим игроком (для лимита мультитейблинга).
  private countUserTables(userId: string): number {
    let n = 0;
    this.rooms.forEach((r) => {
      if (r.players.has(userId)) n++;
    });
    return n;
  }

  // Общие проверки посадки (кулдаун/пароль/банкролл/бай-ин). checkFull=false — для очереди:
  // стол уже полный (это предусловие очереди), но пароль/банкролл/сумму валидируем так же.
  private seatDeny(room: Room, userId: string, password: string | undefined, buyInAmount: number | undefined, checkFull: boolean, networkInfo?: { ip: string; deviceId: string }): JoinDeniedReason | null {
    // Временный кик админом: вход за стол закрыт до истечения кулдауна (без бана аккаунта)
    const cooldownUntil = room.kickCooldowns.get(userId);
    if (cooldownUntil !== undefined) {
      if (Date.now() < cooldownUntil) return 'on-cooldown';
      room.kickCooldowns.delete(userId); // истёк — снимаем
    }
    // Anti-collusion (доделка §10.6): тот же IP/device уже сидит за этим столом.
    if (room.antiCollusionEnabled && networkInfo) {
      const seated = Array.from(room.players.values())
        .filter((p) => p.networkInfo)
        .map((p) => p.networkInfo!);
      if (hasNetworkCollision(seated, networkInfo)) return 'anti-collusion';
    }
    // Стол «полный» для прямого входа, если мест нет ИЛИ есть очередь: пока кто-то ждёт,
    // освободившееся место зарезервировано за очередью (прохожий не занимает его мимо очереди).
    if (checkFull && (room.players.size >= room.maxPlayers || room.waitlist.length > 0)) return 'full';
    if (room.passwordHash) {
      if (!password) return 'password-required';
      if (!bcrypt.compareSync(password, room.passwordHash)) return 'wrong-password';
    }
    // Банкролл: нужны фишки для бай-ина
    const bankroll = this.bankroll.getUserChips(userId);
    if (bankroll === null || bankroll <= 0) return 'no-chips';
    const minBuyIn = room.bigBlind * room.buyInMinBb;
    const maxBuyIn = room.bigBlind * room.buyInMaxBb;
    if (bankroll < minBuyIn) return 'insufficient-bankroll';
    if (buyInAmount !== undefined) {
      if (!Number.isInteger(buyInAmount) || buyInAmount < minBuyIn || buyInAmount > maxBuyIn) {
        return 'invalid-buyin';
      }
      if (bankroll < buyInAmount) return 'insufficient-bankroll';
    }
    return null;
  }

  // Является ли playerId ботом (префикс 'bot:') — делегирует в botIdentity (§9.3-D)
  isBot(playerId: string): boolean {
    return isBotId(playerId);
  }

  // Разослать всем активным сокетам юзера актуальный банкролл — для UI-индикатора в шапке.
  // Для ботов это no-op (нет сокетов).
  notifyBankroll(userId: string, chips?: number): void {
    if (this.isBot(userId)) return;
    const value = chips ?? this.bankroll.getUserChips(userId);
    if (value === null) return;
    for (const [, s] of this.io.sockets.sockets) {
      const u = s.data?.user as { id: string } | undefined;
      if (u && u.id === userId) {
        s.emit(SOCKET_EVENTS.BANKROLL_UPDATE, { chips: value });
      }
    }
  }

  // Записать уведомление во «Входящие» и, если юзер онлайн, доставить через сокет.
  sendInboxNotification(userId: string, type: InboxNotification['type'], text: string): void {
    const notification = sendNotification(userId, type, text);
    for (const [, s] of this.io.sockets.sockets) {
      const u = s.data?.user as { id: string } | undefined;
      if (u && u.id === userId) s.emit(SOCKET_EVENTS.INBOX_NOTIFICATION, { notification });
    }
  }

  // Сохранить chips всех игроков комнаты (один read + один write)
  private persistRoomChips(room: Room): void {
    try {
      const users = readJSON('users.json') as Array<{ id: string; chips: number }>;
      let changed = false;
      room.players.forEach(p => {
        const idx = users.findIndex(u => u.id === p.id);
        if (idx >= 0 && users[idx].chips !== p.chips) {
          users[idx].chips = p.chips;
          changed = true;
        }
      });
      if (changed) writeJSON('users.json', users);
    } catch {
      // users.json временно недоступен — следующий вызов синхронизирует банкролл
    }
  }

  // Список комнат для лобби (без паролей). Закреплённые админом столы — первыми (sort стабилен,
  // порядок внутри групп не меняется).
  // ВАЖНО: НЕ отдаём isBotTable — игроки не должны видеть, какие столы автоматические.
  getRoomList(): RoomInfo[] {
    // Турнирные столы не показываем в обычном кэш-лобби — это другая сущность (см. /api/tournaments).
    return Array.from(this.rooms.values())
      .filter(r => !r.tournamentId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      .map(toRoomInfo);
  }

  // Бродкаст списка комнат подписчикам лобби
  private notifyLobbyChange(): void {
    this.io.to(LOBBY_ROOM).emit(SOCKET_EVENTS.ROOM_LIST, this.getRoomList());
  }

  // Запустить/перезапустить/отменить таймер автостарта
  private scheduleAutoStart(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    clearStartTimer(room);

    if (room.status !== 'waiting' || room.players.size < room.autoStartPlayers) {
      this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { roomId, endsAt: null });
      return;
    }

    const endsAt = Date.now() + this.settings.autostartDelayMs;
    room.startCountdownEndsAt = endsAt;
    room.startTimer = setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r) return;
      r.startTimer = null;
      r.startCountdownEndsAt = null;
      if (r.status === 'waiting' && r.players.size >= r.autoStartPlayers) {
        this.startGame(roomId);
      }
    }, this.settings.autostartDelayMs);

    this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { roomId, endsAt });
  }

  // Добавить игрока или обработать реконнект (комната должна существовать).
  // buyInAmount — запрошенная сумма для посадки (в чипсах). Если не передана — fallback:
  // min(maxBuyIn, bankroll), что близко к старому поведению (сесть с максимумом).
  addPlayer(roomId: string, userId: string, socketId: string, username: string, buyInAmount?: number, networkInfo?: { ip: string; deviceId: string }): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Реконнект: тот же userId уже в комнате — стек на столе сохраняется
    const existing = room.players.get(userId);
    if (existing) {
      existing.socketId = socketId;
      existing.disconnected = false;
      clearDisconnectTimer(existing);
      this.broadcastGameState(roomId);
      this.notifyLobbyChange();
      return true;
    }

    if (room.players.size >= room.maxPlayers) return false;

    const bankroll = this.bankroll.getUserChips(userId);
    if (bankroll === null || bankroll <= 0) return false;

    const minBuyIn = room.bigBlind * room.buyInMinBb;
    const maxBuyIn = room.bigBlind * room.buyInMaxBb;
    if (bankroll < minBuyIn) return false;

    // Определить сумму бай-ина с проверкой диапазона
    const amount = buyInAmount ?? Math.min(maxBuyIn, bankroll);
    if (!Number.isInteger(amount) || amount < minBuyIn || amount > maxBuyIn) return false;
    if (bankroll < amount) return false;

    // Списать сумму бай-ина из банкролла (остаток лежит вне стола)
    this.bankroll.persistChips(userId, bankroll - amount);
    console.log(`🚪 [join] ${username} → table "${room.name}" buy-in=${amount} (mid-hand=${room.status === 'playing'})`);

    const playerCount = room.players.size;
    // Late entry: если комната уже в раздаче, помечаем игрока как folded для текущей.
    // nextPlayer/isRoundComplete его пропустят. В cleanupHand isFolded сбросится для всех.
    const midHandEntry = room.status === 'playing';
    const player = createPlayer({
      id: userId,
      socketId,
      username,
      chips: amount,
      position: playerCount,
      isFolded: midHandEntry,
      timebank: room.timebank.enabled ? room.timebank.startSec : 0,
    });

    // displayName (имя из Telegram) и выбранный аватар — показываем за столом. Берём из users.json.
    try {
      const users = readJSON('users.json') as Array<{ id: string; displayName?: string; avatarSeed?: string }>;
      const u = users.find((x) => x.id === userId);
      if (u?.displayName) player.displayName = u.displayName;
      if (u?.avatarSeed) player.avatar = u.avatarSeed;
    } catch {
      // users.json недоступен — садимся без displayName/avatar, не блокируем посадку
    }

    // HUD-lite: кэшируем VPIP/PFR при посадке (только для людей, не ботов).
    if (!this.isBot(userId)) {
      try { player.hudStats = getHudStats(userId); } catch {
        // hudStats не критичен — посадка не должна падать из-за него
      }
    }

    if (networkInfo) player.networkInfo = networkInfo;

    room.players.set(userId, player);
    this.broadcastGameState(roomId);
    this.notifyLobbyChange();
    this.scheduleAutoStart(roomId);
    return true;
  }

  // Удалить игрока (полностью — например по leaveRoom)
  removePlayer(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Турнирный стол: добровольный выход — форфейт (как банкрот). Турнирные фишки НЕ банкролл —
    // ничего не возвращаем; TournamentManager присвоит финишную позицию через onTournamentBust
    // и продолжит/завершит турнир. Без этой ветки leaveRoom мог бы превратить турнирный стек
    // в реальный банкролл (см. ветку ниже) — финансовая дыра.
    if (room.tournamentId && room.players.has(userId)) {
      const player = room.players.get(userId)!;
      clearDisconnectTimer(player);
      room.players.delete(userId);
      this.onTournamentBust?.(roomId, userId, []); // форфейт — никто не выигрывал раздачу, баунти не платится
      return;
    }

    const player = room.players.get(userId);
    if (player) {
      // Вернуть остаток стека со стола в банкролл.
      // Банкролл и стек живут раздельно: на посадке списали, на выходе возвращаем.
      const bankroll = this.bankroll.getUserChips(userId) ?? 0;
      console.log(`🚪 [leave] ${player.username} ← table "${room.name}" took=${player.chips} (bankroll ${bankroll} → ${bankroll + player.chips})`);
      this.bankroll.persistChips(userId, bankroll + player.chips);
      clearDisconnectTimer(player);
    }
    room.players.delete(userId);

    // Бот ушёл — отвязать от стола, отменить pending decision
    if (this.isBot(userId)) {
      this.botManager.onBotLeaveRoom(userId);
    }

    if (room.players.size === 0) {
      clearStartTimer(room);
      clearWaitlistTimer(room);
      const wasBotTable = room.isBotTable;
      this.rooms.delete(roomId);
      if (wasBotTable) this.botManager.onTableClosed(roomId);
      this.saveRoomsSnapshot();
    } else {
      this.broadcastGameState(roomId);
      this.scheduleAutoStart(roomId);
      // Место освободилось — если есть очередь, запланировать авто-посадку через задержку стола
      this.scheduleWaitlistPromotion(roomId);
    }
    this.notifyLobbyChange();
  }

  // Найти активный сокет пользователя (для посадки из очереди — socketId меняется на реконнекте).
  private findUserSocket(userId: string): Socket | null {
    for (const s of this.io.sockets.sockets.values()) {
      const u = s.data?.user as { id: string } | undefined;
      if (u?.id === userId) return s;
    }
    return null;
  }

  // Встать в очередь на полный стол. Если место есть — садим сразу (нужен socket для join-комнаты).
  // Возвращает: seated — посажен сразу; queued+position — в очереди; error — отказ (как joinDenied).
  joinWaitlist(roomId: string, userId: string, username: string, socket: Socket, password?: string, buyInAmount?: number):
    { seated: true } | { queued: number } | { error: JoinDeniedReason } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'not-found' };
    if (room.players.has(userId)) return { error: 'full' }; // уже за столом — очередь не нужна
    // Уже в очереди — идемпотентно вернуть текущую позицию
    const idx = room.waitlist.findIndex(w => w.userId === userId);
    if (idx >= 0) return { queued: idx + 1 };

    // Валидация (пароль/банкролл/сумма) — без проверки full (в очереди стол как раз полный)
    const deny = this.seatDeny(room, userId, password, buyInAmount, false);
    if (deny) return { error: deny };
    if (buyInAmount === undefined) return { error: 'invalid-buyin' };

    // Гонка: место свободно И очередь пуста (никто не ждёт впереди) — посадить сразу.
    if (room.players.size < room.maxPlayers && room.waitlist.length === 0) {
      socket.join(roomId);
      const ok = this.addPlayer(roomId, userId, socket.id, username, buyInAmount);
      return ok ? { seated: true } : { error: 'invalid-buyin' };
    }

    room.waitlist.push({ userId, username, buyInAmount, addedAt: Date.now() });
    this.notifyLobbyChange();
    return { queued: room.waitlist.length };
  }

  // Выйти из очереди.
  leaveWaitlist(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const before = room.waitlist.length;
    room.waitlist = room.waitlist.filter(w => w.userId !== userId);
    if (room.waitlist.length !== before) this.notifyLobbyChange();
  }

  // Запланировать авто-посадку первого из очереди через задержку стола (если есть место и очередь).
  private scheduleWaitlistPromotion(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.waitlistTimer) return;                       // уже запланировано
    if (room.waitlist.length === 0) return;               // очередь пуста
    if (room.players.size >= room.maxPlayers) return;     // нет свободного места
    const ms = room.waitlistDelayMin * 60 * 1000;
    scheduleWaitlistTimer(room, ms, Date.now() + ms, () => this.promoteFromWaitlist(roomId));
  }

  // Посадить первого валидного игрока из очереди. Невалидных (офлайн/без фишек) — отбрасываем.
  // Если после посадки осталось место и очередь — планируем следующего (через ту же задержку).
  private promoteFromWaitlist(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.waitlistTimer = null;
    room.waitlistPromoteEndsAt = null;
    while (room.waitlist.length > 0 && room.players.size < room.maxPlayers) {
      const entry = room.waitlist[0];
      const sock = this.findUserSocket(entry.userId);
      const bankroll = this.bankroll.getUserChips(entry.userId) ?? 0;
      // Невалиден к моменту посадки — выкинуть из очереди и пробовать следующего
      if (!sock || room.players.has(entry.userId) || entry.buyInAmount <= 0 || bankroll < entry.buyInAmount) {
        room.waitlist.shift();
        continue;
      }
      room.waitlist.shift();
      sock.join(roomId);
      const ok = this.addPlayer(roomId, entry.userId, sock.id, entry.username, entry.buyInAmount);
      if (ok) {
        console.log(`🎟️ [waitlist] ${entry.username} посажен из очереди за "${room.name}"`);
        sock.emit(SOCKET_EVENTS.SEAT_FROM_WAITLIST, { roomId });
        break; // за одну посадку — один игрок
      }
    }
    this.notifyLobbyChange();
    // Осталось место и очередь — запланировать следующего через задержку
    if (room.players.size < room.maxPlayers && room.waitlist.length > 0) {
      this.scheduleWaitlistPromotion(roomId);
    }
  }

  // Мягкий дисконнект: в waiting — сразу удалить, в playing — сит-аут (держим место N минут)
  handleDisconnect(userId: string): void {
    this.rooms.forEach((room, roomId) => {
      const player = room.players.get(userId);
      if (!player) return;

      // Турнирный стол в waiting (ждём второго игрока, напр. неровный сплит MTT) — НЕ удалять.
      // removePlayer на турнирном столе = форфейт (§0.2-A), а тут раздача даже не началась —
      // игрок ничего не сделал, чтобы выбыть. Держим место сит-аутом, как в playing.
      if (room.status === 'waiting' && !room.tournamentId) {
        this.removePlayer(roomId, userId);
        return;
      }

      // В игре — сит-аут: игрок держит место за столом, ему хавает блайнды на SB/BB,
      // а его карты авто-фолдятся (или чек, если бесплатно), когда доходит его ход
      // (см. emitCurrentTurn — отключённый игрок ходит мгновенно, не тратя turn-таймер/таймбанк).
      // Даёт шанс восстановиться при F5/реконнекте/потере связи без потери места.
      // Если сейчас ход самого игрока — НЕ фолдим мгновенно (см. §11.51): turn-таймер уже
      // считает время и даёт окно на F5/реконнект без потери текущей раздачи. Быстрый sit-out
      // авто-фолд (emitCurrentTurn) сработает на последующих ходах/руках, пока он отключён.
      player.disconnected = true;
      this.broadcastGameState(roomId);

      // По истечении сит-аута (5..30 мин, настройка стола) — окончательно убрать со стола.
      // Реконнект (addPlayer) сбрасывает disconnected и этот таймер → счётчик начинается заново.
      const sitOutMs = room.sitOutTimeoutMin * 60 * 1000;
      scheduleDisconnectTimer(player, sitOutMs, () => {
        const r = this.rooms.get(roomId);
        const p = r?.players.get(userId);
        if (p && p.disconnected) {
          this.removePlayer(roomId, userId);
        }
      });
    });
  }

  // Восстановление столов при (ре)коннекте сокета (мультитейблинг, reload-safe).
  // Для всех столов, где игрок ещё СИДИТ (sit-out держит место), возвращаем его сокет
  // в socket.io-комнату + реконнект (addPlayer обновит socketId/снимет disconnected и
  // разошлёт состояние этому сокету → пилюли восстановятся). Не сажает заново: столы,
  // откуда игрока уже убрали, просто не восстанавливаются (никакого пере-бай-ина).
  reconnectUserTables(userId: string, socket: Socket): void {
    this.rooms.forEach((room, roomId) => {
      const p = room.players.get(userId);
      if (!p) return;
      socket.join(roomId);
      this.addPlayer(roomId, userId, socket.id, p.username);
    });
  }

  // Начать игру.
  // testDeck — опциональный параметр для тестов: при наличии shuffle пропускается, используется
  // переданный массив. dealCards/dealCommunityCards берут карты через pop() (с конца массива),
  // поэтому caller должен размещать карты в обратном порядке раздачи. См. test-helper buildDeck().
  // Production-callers (3 шт: index.ts, scheduleAutoStart, cleanupHand) testDeck не передают.
  startGame(roomId: string, testDeck?: Card[]): void {
    const room = this.rooms.get(roomId);
    if (!room || room.players.size < 2) return;
    if (room.status === 'playing') return;

    if (room.startTimer) {
      clearStartTimer(room);
      this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { roomId, endsAt: null });
    }

    const deck = testDeck ?? shuffleDeck(createDeck(room.format));
    const playerIds = Array.from(room.players.keys());

    // Раздача карт
    const { hands, remainingDeck } = dealCards(deck, playerIds.length);

    playerIds.forEach((id, i) => {
      const player = room.players.get(id)!;
      player.cards = hands[i];
      player.isFolded = false;
      player.currentBet = 0;
      player.totalCommitted = 0;
      player.revealedCards = undefined; // сброс добровольно показанных карт прошлой раздачи
      player.handStartChips = player.chips; // снапшот до блайндов — для PnL Δ людей в cleanupHand
    });

    room.deck = remainingDeck;
    room.communityCards = [];
    room.communityCardsB = null; // сброс второго борда (Double Board/RIMT) прошлой раздачи
    room.deckB = null;
    room.settlementMode = undefined;
    room.pot = 0;
    room.lastHandRake = 0; // сброс рейка прошлой раздачи
    room.currentBet = room.bigBlind;
    room.phase = 'preflop';
    room.status = 'playing';
    room.actionsThisRound = new Set();
    room.lastRaiseSize = room.bigBlind;
    room.lockedCallers = new Set();
    room.dealerIndex = (room.dealerIndex + 1) % playerIds.length;
    room.handIndex++; // для seeded RNG ботов
    // Запомнить стартовый стек каждого бота для PnL Δ в cleanupHand
    playerIds.forEach((id) => {
      if (this.isBot(id)) {
        const rt = this.botManager.getBotRuntime(id);
        const p = room.players.get(id);
        if (rt && p) rt.handStartChips = p.chips;
      }
    });

    // Heads-up (2 игрока): D=SB, не-D=BB. Префлоп: SB (=D) ходит первым, BB last.
    // Multi-way (3+): SB=D+1, BB=D+2, UTG=D+3. Префлоп: UTG первый, BB last (стандартный холдем).
    // Для N=3: UTG = (D+3) % 3 = D → D ходит первым (что и есть UTG в 3-max).
    const N = playerIds.length;
    const isHeadsUp = N === 2;
    const sbIndex = isHeadsUp ? room.dealerIndex : (room.dealerIndex + 1) % N;
    const bbIndex = isHeadsUp ? (room.dealerIndex + 1) % N : (room.dealerIndex + 2) % N;
    const smallBlindPlayer = this.getPlayerAt(room, sbIndex);
    const bigBlindPlayer = this.getPlayerAt(room, bbIndex);

    // Префлоп: heads-up — SB первый (BB last); multi-way — UTG первый (BB last естественным wrap-around).
    // BB получает «BB option» (последнее слово) автоматически через isRoundComplete: после blinds
    // он не в actionsThisRound, поэтому круг не закрывается, пока он не сходит check/raise.
    room.currentPlayerIndex = isHeadsUp ? sbIndex : (room.dealerIndex + 3) % N;

    console.log(`\n🎲 [hand-start] table="${room.name}" SB=${room.smallBlind} BB=${room.bigBlind} (${N} игроков, ${isHeadsUp ? 'heads-up' : 'multi-way'})`);
    playerIds.forEach((id, i) => {
      const p = room.players.get(id)!;
      const roles: string[] = [];
      if (i === room.dealerIndex) roles.push('D');
      if (i === sbIndex) roles.push('SB');
      if (i === bbIndex) roles.push('BB');
      const role = roles.length > 0 ? roles.join('+') : '-';
      const cards = p.cards.map(c => c.rank + c.suit[0]).join('');
      console.log(`   🃏 [${role}] ${p.username} chips=${p.chips} cards=${cards}`);
    });

    // Лог действий раздачи (для replay в истории) — сброс на старте, блайнды/анте записываем здесь.
    room.actionLog = [];

    // Анте: все играющие вносят анте в банк ДО блайндов (POKER_RULES §6.7)
    if (room.ante > 0) {
      playerIds.forEach((id) => {
        this.postAnte(room, id, room.ante);
        room.actionLog!.push({ phase: 'preflop', playerId: id, type: 'ante', amount: room.ante });
      });
      console.log(`   🎰 [ante] каждый внёс ${room.ante} (pot=${room.pot})`);
    }

    if (room.bombPotEnabled) {
      // Bomb Pot (доделка §10.6): все вносят форс-бет 3×BB (как в UI-заглушке bombPotAnte),
      // флоп раздаётся сразу — без префлоп-торгов. SB/BB не постятся отдельно.
      const bombAmount = room.bigBlind * 3;
      playerIds.forEach((id) => {
        this.postAnte(room, id, bombAmount);
        room.actionLog!.push({ phase: 'preflop', playerId: id, type: 'bomb', amount: bombAmount });
      });
      console.log(`   💣 [bomb-pot] каждый внёс ${bombAmount} (pot=${room.pot})`);
      const flop = dealCommunityCards(room.deck, 3);
      room.communityCards = flop.cards;
      room.deck = flop.remainingDeck;
      room.phase = 'flop';
      room.currentBet = 0;
      room.lastRaiseSize = room.bigBlind;
      room.currentPlayerIndex = (room.dealerIndex + 1) % N; // постфлоп-порядок (SB-позиция первая)
      console.log(`   🌊 [bomb-pot flop] ${flop.cards.map(c => c.rank + c.suit[0]).join(' ')} (pot=${room.pot})`);
    } else {
      if (smallBlindPlayer) {
        this.placeBet(room, smallBlindPlayer.id, room.smallBlind);
        room.actionLog.push({ phase: 'preflop', playerId: smallBlindPlayer.id, type: 'sb', amount: room.smallBlind });
        console.log(`   💰 [blind] SB ${smallBlindPlayer.username} → ${room.smallBlind} (pot=${room.pot})`);
      }
      if (bigBlindPlayer) {
        this.placeBet(room, bigBlindPlayer.id, room.bigBlind);
        room.actionLog.push({ phase: 'preflop', playerId: bigBlindPlayer.id, type: 'bb', amount: room.bigBlind });
        console.log(`   💰 [blind] BB ${bigBlindPlayer.username} → ${room.bigBlind} (pot=${room.pot})`);
      }

      // Стрэддл (доделка §10.6): при включении UTG ОБЯЗАТЕЛЬНО стрэддлит каждую раздачу
      // (mandatory straddle table — без личного опта игрока, см. план реализации). Heads-up
      // не имеет UTG — пропускаем. Если у UTG не хватает фишек на полный стрэддл — ходит как обычно.
      if (room.straddleEnabled && !isHeadsUp) {
        const utgIndex = room.currentPlayerIndex; // = (dealerIndex+3) % N, уже посчитан выше
        const utgPlayer = this.getPlayerAt(room, utgIndex);
        const straddleAmount = room.bigBlind * 2;
        if (utgPlayer && utgPlayer.chips >= straddleAmount) {
          this.placeBet(room, utgPlayer.id, straddleAmount);
          room.currentBet = straddleAmount;
          room.lastRaiseSize = room.bigBlind; // стрэддл = полный рейз на 1×BB сверху BB
          room.currentPlayerIndex = (utgIndex + 1) % N; // ход начинается после стрэддлера
          room.actionLog.push({ phase: 'preflop', playerId: utgPlayer.id, type: 'straddle', amount: straddleAmount });
          console.log(`   💰 [straddle] ${utgPlayer.username} → ${straddleAmount} (pot=${room.pot})`);
        }
      }
    }

    this.broadcastGameState(roomId);
    this.emitCurrentTurn(roomId);
    this.notifyLobbyChange();
  }

  // Действие игрока
  handlePlayerAction(roomId: string, userId: string, action: string, amount?: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.status !== 'playing') return;

    const playerIds = Array.from(room.players.keys());
    if (playerIds[room.currentPlayerIndex] !== userId) return;

    const player = room.players.get(userId);
    if (!player || player.isFolded) return;

    // Если игрок действовал во время таймбанк-фазы — списать прошедшие секунды
    if (room.turnTimebankStartedAt !== null && room.turnTimebankPlayerId === userId) {
      const elapsedSec = Math.ceil((Date.now() - room.turnTimebankStartedAt) / 1000);
      player.timebank = Math.max(0, player.timebank - elapsedSec);
    }

    // Игрок сделал ход в срок — сбрасываем оба таймера (основной + timebank)
    clearTurnTimers(room);

    let broadcastAmount: number | undefined;

    // Incomplete all-in (§5.2): уже сходившие call'еры не могут re-raise
    if (action === 'raise' && room.lockedCallers.has(userId)) return;

    switch (action) {
      case 'fold':
        player.isFolded = true;
        room.actionsThisRound.add(userId);
        console.log(`   ▶ [${room.phase}] ${player.username} FOLD (chips=${player.chips} pot=${room.pot})`);
        break;
      case 'check':
        if (player.currentBet < room.currentBet) return;
        room.actionsThisRound.add(userId);
        console.log(`   ▶ [${room.phase}] ${player.username} CHECK (chips=${player.chips} pot=${room.pot})`);
        break;
      case 'call':
        broadcastAmount = room.currentBet - player.currentBet;
        this.placeBet(room, userId, broadcastAmount);
        room.actionsThisRound.add(userId);
        console.log(`   ▶ [${room.phase}] ${player.username} CALL ${broadcastAmount} (chips=${player.chips} pot=${room.pot})`);
        break;
      case 'raise': {
        // Валидация (min-raise + исключение all-in) — чистая bettingRules.isLegalRaise.
        if (!isLegalRaise(amount, room.currentBet, room.lastRaiseSize, player.chips, player.currentBet)) return;
        const to = amount as number;
        const prevCurrentBet = room.currentBet;
        const delta = to - player.currentBet;
        room.currentBet = to;
        room.lastRaiseSize = to - prevCurrentBet; // обновляем для следующего min-raise
        this.placeBet(room, userId, delta);
        // Полный raise сбрасывает круг и снимает локи
        room.actionsThisRound = new Set([userId]);
        room.lockedCallers = new Set();
        broadcastAmount = to; // итоговый размер ставки (raise to)
        console.log(`   ▶ [${room.phase}] ${player.username} RAISE to ${to} (+${delta}) (chips=${player.chips} pot=${room.pot})`);
        break;
      }
      case 'all-in': {
        const before = player.chips;
        const prevCurrentBet = room.currentBet;
        this.placeBet(room, userId, player.chips);
        if (player.currentBet > room.currentBet) {
          const raiseSize = player.currentBet - prevCurrentBet;
          room.currentBet = player.currentBet;
          if (raiseSize >= room.lastRaiseSize) {
            // Полный all-in raise — открывает action для всех (§5.2)
            room.lastRaiseSize = raiseSize;
            room.actionsThisRound = new Set([userId]);
            room.lockedCallers = new Set();
          } else {
            // Incomplete all-in — уже сходившие могут только call/fold (§5.2)
            room.lockedCallers = new Set(room.actionsThisRound);
            room.actionsThisRound.add(userId);
          }
        } else {
          room.actionsThisRound.add(userId);
        }
        broadcastAmount = player.currentBet;
        console.log(`   ▶ [${room.phase}] ${player.username} ALL-IN ${before} → bet=${player.currentBet} (chips=${player.chips} pot=${room.pot})`);
        break;
      }
      default:
        return;
    }

    // Лог действия для replay в истории (broadcastAmount: call=добор, raise=raise-to, all-in=ставка).
    room.actionLog?.push({ phase: room.phase, playerId: userId, type: action, amount: broadcastAmount });

    // Speech bubble над аватаром: показываем действие всем в комнате (см. roadmap 10.12)
    this.io.to(roomId).emit(SOCKET_EVENTS.PLAYER_ACTION_BROADCAST, {
      playerId: userId,
      action,
      amount: broadcastAmount,
    });

    this.nextPlayer(roomId);
  }

  // Общий race-guard таймеров хода: вернуть room+player, если ход ВСЁ ещё за userId и он не сфолдил;
  // иначе null (ход сменился / игрок ушёл — устаревший таймер не должен ничего делать).
  // Дедуп проверки, дублировавшейся в startTurnTimer и startTimebankTimer (ROADMAP §9.3-B, TimerService).
  private timeoutTarget(roomId: string, userId: string): { room: Room; player: Player } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const ids = Array.from(room.players.keys());
    if (ids[room.currentPlayerIndex] !== userId) return null;
    const player = room.players.get(userId);
    if (!player || player.isFolded) return null;
    return { room, player };
  }

  // Авто-действие по тайм-ауту: бесплатный ход (call=0) → auto-CHECK, иначе auto-FOLD (стандарт румов).
  private autoActOnTimeout(roomId: string, userId: string, room: Room, player: Player, reason: string): void {
    const canCheck = player.currentBet >= room.currentBet;
    const autoAction: 'check' | 'fold' = canCheck ? 'check' : 'fold';
    console.log(`⏰ Auto-${autoAction.toUpperCase()} (${reason}): ${player.username}`);
    this.handlePlayerAction(roomId, userId, autoAction);
  }

  // Phase 1: основной таймер хода. По истечении — если у игрока есть таймбанк, запускаем Phase 2;
  // иначе сразу auto-fold.
  private startTurnTimer(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    scheduleTurnPhase1(room, room.turnDurationMs, () => {
      const t = this.timeoutTarget(roomId, userId);
      if (!t) return;
      // Есть таймбанк — переходим в Phase 2
      if (t.room.timebank.enabled && t.player.timebank > 0) {
        console.log(`⏳ Timebank engaged: ${t.player.username} (${t.player.timebank}с)`);
        this.startTimebankTimer(roomId, userId);
        this.broadcastGameState(roomId);
        return;
      }
      this.autoActOnTimeout(roomId, userId, t.room, t.player, 'timeout');
    });
  }

  // Phase 2: таймбанк-таймер. По истечении — обнуляем timebank игрока и auto-fold.
  private startTimebankTimer(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player || player.timebank <= 0) return;
    scheduleTurnPhase2(room, userId, player.timebank, () => {
      const t = this.timeoutTarget(roomId, userId);
      if (!t) return;
      t.player.timebank = 0;
      this.autoActOnTimeout(roomId, userId, t.room, t.player, 'timebank exhausted');
    });
  }

  // Сообщить игроку что его ход.
  // Бот: не шлём YOUR_TURN (нет socket'a), вместо этого планируем решение через BotManager.
  // Turn-timer всё равно стартует как safety-net на случай, если бот «завис» (на крэше).
  private emitCurrentTurn(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const playerIds = Array.from(room.players.keys());
    if (room.currentPlayerIndex >= playerIds.length) {
      console.error(`Invalid currentPlayerIndex: ${room.currentPlayerIndex}`);
      clearTurnTimers(room);
      return;
    }

    const currentPlayerId = playerIds[room.currentPlayerIndex];
    const currentPlayer = room.players.get(currentPlayerId);

    if (currentPlayer && !currentPlayer.isFolded && currentPlayer.chips > 0) {
      if (this.isBot(currentPlayerId)) {
        console.log(`🤖 Bot turn: ${currentPlayer.username}`);
        this.startTurnTimer(roomId, currentPlayerId);
        this.broadcastGameState(roomId);
        // Боту даём «подумать» через BotManager — он сам выберет delay и вызовет applyBotAction
        this.botManager.scheduleBotDecision(roomId, currentPlayerId);
      } else if (currentPlayer.disconnected) {
        // Сит-аут: игрок отключён — не ждём полный turn-таймер и не тратим таймбанк,
        // авто-фолдим (или чек, если бесплатно) почти мгновенно, чтобы стол не висел.
        console.log(`💤 Sit-out auto-act: ${currentPlayer.username}`);
        scheduleSitOutTimer(room, SITOUT_AUTOACT_MS, () => {
          const t = this.timeoutTarget(roomId, currentPlayerId);
          if (!t) return;
          this.autoActOnTimeout(roomId, currentPlayerId, t.room, t.player, 'sit-out');
        });
        this.broadcastGameState(roomId);
      } else {
        console.log(`🎯 Your turn: ${currentPlayer.username}`);
        this.io.to(currentPlayer.socketId).emit(SOCKET_EVENTS.YOUR_TURN, {
          roomId,
          currentBet: room.currentBet,
          playerBet: currentPlayer.currentBet,
          pot: room.pot,
        });
        this.startTurnTimer(roomId, currentPlayerId);
        this.broadcastGameState(roomId);
      }
    } else {
      console.log(`⏭️ Skipping player, moving to next`);
      clearTurnTimers(room);
      this.nextPlayer(roomId);
    }
  }

  // Переход к следующему игроку или фазе
  private nextPlayer(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    console.log(`Next player called, current index: ${room.currentPlayerIndex}`);
    
    const activePlayers = Array.from(room.players.values()).filter(p => !p.isFolded);
    
    if (activePlayers.length === 1) {
      console.log(`Only one active player left, ending game`);
      this.endGame(roomId, [activePlayers[0].id]);
      return;
    }

    const playerIds = Array.from(room.players.keys());
    let nextIndex = (room.currentPlayerIndex + 1) % playerIds.length;
    let attempts = 0;

    while (attempts < playerIds.length) {
      const nextPlayer = room.players.get(playerIds[nextIndex]);
      if (nextPlayer && !nextPlayer.isFolded && nextPlayer.chips > 0) {
        if (isRoundComplete(room)) {
          console.log(`Round complete, advancing phase`);
          this.advancePhase(roomId);
          return;
        }
        room.currentPlayerIndex = nextIndex;
        console.log(`Next player index set to: ${nextIndex} (${nextPlayer.username})`);
        this.broadcastGameState(roomId);
        this.emitCurrentTurn(roomId);
        return;
      }
      nextIndex = (nextIndex + 1) % playerIds.length;
      attempts++;
    }

    console.log(`No active players found, advancing phase`);
    this.advancePhase(roomId);
  }

  // Проверка завершения круга ставок: каждый active либо all-in,
  // либо сходил И уравнял ставку
  // Переход к следующей фазе
  private advancePhase(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Сброс ставок и круга действий
    room.players.forEach(p => { p.currentBet = 0; });
    room.currentBet = 0;
    room.actionsThisRound = new Set();
    room.lastRaiseSize = room.bigBlind;
    room.lockedCallers = new Set();
    clearTurnTimers(room);

    // RIMT/EV Cashout (доделка §10.6): торги закрылись ДОСРОЧНО (все, кто мог бы ещё биться
    // за банк, либо all-in, либо их ≤1) и борд ещё не полный — обычная доигровка по улицам
    // не нужна, решаем раздачу досрочно (двойной прогон борда либо equity-сплит).
    if (room.communityCards.length < 5 && (room.rimtEnabled || room.evCashoutEnabled) && this.isHandDecidedEarly(room)) {
      this.resolveEarlyDecided(roomId);
      return;
    }

    const t = computePhaseTransition(room.phase, room.deck);

    if (t.isShowdown) {
      this.showdown(roomId);
      return;
    }

    // Double Board (доделка §10.6): на первом постфлоп-переходе форкаем остаток деки —
    // второй борд дилится из независимо перемешанной копии (карты МОГУТ повторяться между
    // бордами — как Run It Twice в реальных рум-софтах, два независимых прогона остатка деки).
    if (room.doubleBoardEnabled && room.phase === 'preflop') {
      room.deckB = shuffleDeck(room.deck);
    }

    room.communityCards = [...room.communityCards, ...t.newCards];
    room.deck = t.remainingDeck;

    if (room.doubleBoardEnabled && room.deckB) {
      const tb = computePhaseTransition(room.phase, room.deckB);
      room.communityCardsB = [...(room.communityCardsB ?? []), ...tb.newCards];
      room.deckB = tb.remainingDeck;
    }

    room.phase = t.nextPhase;

    const cardsStr = t.newCards.map(c => c.rank + c.suit[0]).join(' ');
    if (t.nextPhase === 'flop') {
      console.log(`🌊 [flop] ${cardsStr} (pot=${room.pot})`);
    } else {
      console.log(`🌊 [${t.nextPhase}] ${cardsStr} (board: ${room.communityCards.map(c => c.rank + c.suit[0]).join(' ')}, pot=${room.pot})`);
    }

    room.currentPlayerIndex = (room.dealerIndex + 1) % room.players.size;
    this.broadcastGameState(roomId);
    this.emitCurrentTurn(roomId);
  }

  // RIMT/EV Cashout (доделка §10.6): больше никто не сможет сделать ставку в этой раздаче —
  // среди недосфолдивших ≤1 игрок с фишками (остальные all-in). Борд ещё не полный (проверяется
  // отдельно вызывающим) — обычный одно-стрит-за-раз каскад можно (и нужно) пропустить.
  private isHandDecidedEarly(room: Room): boolean {
    const canStillAct = Array.from(room.players.values()).filter(p => !p.isFolded && p.chips > 0).length;
    return canStillAct <= 1;
  }

  // Доиграть один борд от текущей фазы до ривера (с правильными burn-картами на каждой улице),
  // не дожидаясь действий игроков — используется RIMT при досрочном all-in.
  private dealRemainingBoard(phase: GamePhase, deck: Card[]): { cards: Card[]; remainingDeck: Card[] } {
    let currentPhase = phase;
    let cards: Card[] = [];
    let remainingDeck = deck;
    while (currentPhase !== 'river' && currentPhase !== 'showdown') {
      const t = computePhaseTransition(currentPhase, remainingDeck);
      cards = [...cards, ...t.newCards];
      remainingDeck = t.remainingDeck;
      currentPhase = t.nextPhase;
    }
    return { cards, remainingDeck };
  }

  // RIMT (доделка §10.6): ранний all-in до ривера — доигрываем борд ДВАЖДЫ (два независимых
  // форка остатка деки), банк делится между прогонами (см. multiRunService.ts). EV Cashout —
  // приоритетнее при одновременном включении (см. план реализации/§10.6).
  private resolveEarlyDecided(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const allPlayers = Array.from(room.players.values());
    const active = allPlayers.filter(p => !p.isFolded && p.cards.length > 0);
    const playersForShowdown = allPlayers.map(p => ({ id: p.id, username: p.username, cards: p.cards, totalCommitted: p.totalCommitted }));
    const activeForShowdown = active.map(p => ({ id: p.id, username: p.username, cards: p.cards, totalCommitted: p.totalCommitted }));

    if (room.evCashoutEnabled) {
      // EV Cashout (доделка §10.6): вместо доигровки — банк делится по equity (Монте-Карло
      // между РЕАЛЬНЫМИ дырочными картами контестантов, см. computeRealEquity в equity.ts).
      // Борд НЕ доигрывается (room.communityCards остаётся как был на момент триггера) — это
      // осознанное решение: показывать «случайно дотасованный» борд, который не определял
      // фактическую выплату, было бы только путать игроков (см. план реализации).
      console.log(`   📐 [EV Cashout] ранний all-in — банк делится по equity (pot=${room.pot})`);
      room.settlementMode = 'evCashout';

      const flopDealt = room.communityCards.length >= 3;
      const rakeTotal = computeRake(room.pot, room.bigBlind, room.rake, flopDealt);
      const distributable = room.pot - rakeTotal;

      const equities = computeRealEquity(
        active.map(p => ({ id: p.id, hole: p.cards })),
        room.communityCards,
        room.deck,
        room.format,
      );

      const ids = Object.keys(equities);
      const amounts: Record<string, number> = {};
      let distributed = 0;
      ids.forEach((id, idx) => {
        if (idx === ids.length - 1) {
          amounts[id] = Math.max(0, distributable - distributed); // последнему — остаток (без потери центов)
        } else {
          const amt = Math.floor(distributable * equities[id]);
          amounts[id] = amt;
          distributed += amt;
        }
      });

      const result: ShowdownResult = {
        winners: ids.filter(id => amounts[id] > 0),
        handInfo: undefined,
        amounts,
        rake: rakeTotal,
        badBeatDrop: 0,
      };

      this.applyShowdownResult(roomId, result);
      return;
    }

    const deckA = shuffleDeck(room.deck);
    const deckB = shuffleDeck(room.deck);
    const runA = this.dealRemainingBoard(room.phase, deckA);
    const runB = this.dealRemainingBoard(room.phase, deckB);
    const boardA = [...room.communityCards, ...runA.cards];
    const boardB = [...room.communityCards, ...runB.cards];
    room.communityCards = boardA;
    room.communityCardsB = boardB;
    room.deck = runA.remainingDeck;
    room.deckB = runB.remainingDeck;
    room.settlementMode = 'rimt';

    console.log(`   🎲 [RIMT] ранний all-in — доигрываем борд 2× (pot=${room.pot})`);

    const result = resolveMultiRunShowdown(
      room.pot,
      [boardA, boardB],
      room.bigBlind,
      room.rake,
      room.format,
      playersForShowdown,
      activeForShowdown,
    );

    this.applyShowdownResult(roomId, result);
  }

  // Хвост showdown/resolveEarlyDecided: применить chip-дельты, очистить банк, записать рейк/
  // бэдбит-дроп в пул, закрыть раздачу (endGame). Бэдбит-ДЕТЕКЦИЯ (не дроп) сюда не входит —
  // она специфична для «настоящего» showdown() (один финальный борд, см. вызывающий код).
  private applyShowdownResult(roomId: string, result: ShowdownResult): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [id, delta] of Object.entries(result.amounts)) {
      const p = room.players.get(id);
      if (p) p.chips += delta;
    }
    room.pot = 0;
    room.lastHandRake = result.rake;

    if (result.badBeatDrop > 0) {
      addToPool(result.badBeatDrop);
      console.log(`   🎰 [badbeat] дроп в пул: ${result.badBeatDrop}`);
    }

    this.endGame(roomId, result.winners, result.handInfo, result.amounts);
  }

  // Шоудаун
  private showdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const boardStr = room.communityCards.map(c => c.rank + c.suit[0]).join(' ');
    console.log(`🏆 [showdown] board: ${boardStr} pot=${room.pot}`);
    // Лог всех активных игроков с их комбинациями
    room.players.forEach(p => {
      if (p.isFolded || p.cards.length === 0) return;
      try {
        const hr = evaluateHand(p.cards, room.communityCards, room.format);
        const handCards = p.cards.map(c => c.rank + c.suit[0]).join('');
        console.log(`   👁  ${p.username} hand=${handCards} → ${formatHandName(hr)}`);
      } catch {
        // лог best-effort — сбой evaluateHand не должен прерывать showdown
      }
    });

    room.phase = 'showdown';

    // Side pots: разбиваем pot на слои по уровням commit активных игроков.
    // Каждый слой выигрывает лучшая рука из тех, кто внёс ≥ уровня слоя.
    // Алгоритм покрывает обычные раздачи (все equal commit → один слой = всё) и
    // multi-way all-in с разными стеками (несколько слоёв).
    const allPlayers = Array.from(room.players.values());
    const active = allPlayers.filter(p => !p.isFolded && p.cards.length > 0);

    // Bad Beat Jackpot — квалификация стола для отчисления в пул (Фаза 2):
    // джекпот включён + публичный стол (без пароля) + не bot-стол + нет ботов за столом + банк ≥ 10ББ.
    // Сам дроп считается с пост-рейкового остатка внутри distributePot (как рейк).
    const potTotal = room.pot; // банк до распределения — для guard'а ≥10ББ
    const bbState = getBadBeatState();
    const hasBots = allPlayers.some(p => this.isBot(p.id));
    // Double Board (доделка §10.6): детекция Bad Beat пропускается — нет единого финального
    // борда для проверки квалифицирующей руки (см. multiRunService.ts).
    const bbActive =
      !room.doubleBoardEnabled &&
      bbState.enabled &&
      room.passwordHash === null &&
      !room.isBotTable &&
      !hasBots &&
      potTotal >= 10 * room.bigBlind;

    const playersForShowdown = allPlayers.map(p => ({ id: p.id, username: p.username, cards: p.cards, totalCommitted: p.totalCommitted }));
    const activeForShowdown = active.map(p => ({ id: p.id, username: p.username, cards: p.cards, totalCommitted: p.totalCommitted }));

    const result = room.doubleBoardEnabled && room.communityCardsB
      ? resolveMultiRunShowdown(
          room.pot,
          [room.communityCards, room.communityCardsB],
          room.bigBlind,
          room.rake,
          room.format,
          playersForShowdown,
          activeForShowdown,
        )
      : resolveShowdown(
          room.pot,
          room.communityCards,
          room.bigBlind,
          room.rake,
          room.format,
          playersForShowdown,
          activeForShowdown,
          bbActive ? bbState : null,
        );

    const allWinners = result.winners;
    if (allWinners.length === 0) {
      console.log(`   💨 showdown без активных — pot ${potTotal} сгорает`);
    }

    // Bad Beat Jackpot — детект срабатывания + выплата из пула (Фаза 3, Вариант А).
    // Запускается ДО применения основных chip-дельт (applyShowdownResult ниже) — детекция
    // читает только карты/борд (не зависит от room.pot/chips), выплата джекпота — отдельная
    // аддитивная прибавка к стеку, порядок относительно основного payout не важен.
    // Условия (полные) — в detectBadBeat: рука ≥ порога, обе карманные у победителя и проигравшего,
    // каре → карманная пара, ≥4 сдали префлоп. Карты при фолде не очищаются (cleanup позже),
    // поэтому «сдал префлоп» = игроки с картами на showdown.
    if (bbActive && allWinners.length > 0) {
      const dealtCount = allPlayers.filter(p => p.cards.length > 0).length;
      const detect = detectBadBeat({
        contenders: active.map(p => ({ id: p.id, hole: p.cards })),
        community: room.communityCards,
        winnerIds: allWinners,
        presetId: bbState.triggers[room.format === 'shortdeck' ? 'short' : 'nlh'] ?? (room.format === 'shortdeck' ? 'aaaa' : 'aaajj'),
        dealtCount,
        format: room.format,
      });
      if (detect) {
        const fresh = getBadBeatState();
        const tier = selectTier(fresh.tiers, room.bigBlind);
        if (tier) {
          const otherIds = allPlayers
            .filter(p => p.cards.length > 0 && p.id !== detect.loserId && p.id !== detect.opponentId)
            .map(p => p.id);
          const { payouts, total } = computeBadBeatPayout({
            pool: fresh.pool,
            tier,
            loserId: detect.loserId,
            opponentId: detect.opponentId,
            otherIds,
          });
          if (total > 0) {
            for (const { id, amount } of payouts) {
              const p = room.players.get(id);
              if (p) p.chips += amount; // приз в стек (даже если игрок отключён — место его)
            }
            payoutFromPool(total, { ts: Date.now(), total, loser: detect.loserId, opponent: detect.opponentId });
            const loserName = room.players.get(detect.loserId)?.username ?? detect.loserId;
            console.log(`🎉 [badbeat] JACKPOT! ${loserName} сорвал бэд-бит — выплачено ${total} из пула`);
            // Уведомление во «Входящие» каждому получателю (§10.13)
            for (const { id, amount } of payouts) {
              const fmt = (amount / 100).toFixed(2);
              this.sendInboxNotification(id, 'broadcast',
                id === detect.loserId
                  ? `Бэд-бит Джекпот! Ваша рука проиграла, но вы получили $${fmt} из пула.`
                  : `Бэд-бит Джекпот! Вы получили $${fmt} из пула на столе «${room.name}».`
              );
            }
          }
        }
      }
    }

    this.applyShowdownResult(roomId, result);
  }

  // Конец раздачи: показываем шоудаун 5 сек, потом cleanup
  private endGame(roomId: string, winners: string[], handInfo?: { name: string; cards: Card[] }, amounts?: Record<string, number>): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    clearTurnTimers(room);
    room.lastHandWinners = winners; // для атрибуции баунти при бaсте (см. autoLeaveBrokePlayers)

    let winAmounts = amounts;
    // Если endGame вызван не через showdown (все folded кроме одного) — забираем pot ему
    // (showdown сам бы это сделал, но endGame может прийти из nextPlayer "Only one active player left")
    if (room.phase !== 'showdown' && winners.length === 1 && room.pot > 0) {
      const winner = room.players.get(winners[0]);
      if (winner) {
        // Рейк (no flop no drop: до флопа = 0). Удерживаем из банка перед выдачей победителю.
        const flopDealt = room.communityCards.length >= 3;
        const rake = computeRake(room.pot, room.bigBlind, room.rake, flopDealt);
        room.lastHandRake = rake;
        const payout = room.pot - rake;
        winner.chips += payout;
        winAmounts = { [winner.id]: payout };
        console.log(`🏆 [uncontested] ${winner.username} забирает pot=${room.pot}${rake > 0 ? ` (рейк ${rake})` : ''} → +${payout} (остальные folded)`);
        room.pot = 0;
        // No Turn No Show (доделка §10.6): победитель без вскрытия автоматически показывает
        // карты (анти-чит — честность RNG видна даже без контеста), а не остаётся скрытым
        // до добровольного тапа (showCard), как по умолчанию.
        if (room.noTurnNoShowEnabled && winner.cards.length >= 2) {
          winner.revealedCards = [0, 1];
        }
      }
    }

    // Покажем финальную раздачу с открытыми картами и сообщим победителей
    room.phase = 'showdown';

    // Сумма банка раздачи (все вложения, до рейка) — нужна и истории раздач (ниже), и платной
    // фиче Rabbit Hunting (§10.12, считается раньше первого broadcastGameState).
    let potTotal = 0;
    room.players.forEach((p) => { potTotal += p.totalCommitted; });

    // Rabbit Hunting (ROADMAP §10.12): если рука кончилась раньше ривера — за плату можно увидеть
    // карты, которые пришли бы. Окно — пока phase==='showdown' (cleanupHand сбрасывает поля).
    // revealed персонализируется в сериализаторе (только оплатившему), сама оплата — requestRabbitHunt.
    room.rabbitHuntPaidBy = new Set();
    const eligibility = computeRabbitHuntEligibility(
      this.settings.paidFeatures.rabbitHunt,
      potTotal,
      room.communityCards.length,
      room.deck,
    );
    room.rabbitHuntPrice = eligibility?.price;
    room.rabbitHuntCards = eligibility?.cards;

    this.broadcastGameState(roomId);
    this.io.to(roomId).emit(SOCKET_EVENTS.GAME_WINNER, {
      roomId,
      winners,
      handName: handInfo?.name,
      winningCards: handInfo?.cards,
      amounts: winAmounts ?? {},
    });

    // История раздач (ROADMAP §10.10): снимок раздачи для детального просмотра.
    // Пишем здесь, пока борд/карманные ещё не очищены (cleanupHand их сбросит).
    // reached=showdown-путь (handInfo задан) → не-folded показали карты (revealed, §0.1);
    // uncontested (все folded кроме одного) → никто не раскрывался.
    if (this.handRecorder) {
      const reached = handInfo !== undefined;
      const players = Array.from(room.players.values())
        .filter((p) => p.handStartChips !== undefined)
        .map((p) => ({
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          cards: p.cards,
          folded: p.isFolded,
          revealed: reached && !p.isFolded,
          net: p.chips - (p.handStartChips ?? p.chips),
        }));
      this.handRecorder({
        t: Date.now(),
        roomId: room.id,
        roomName: room.name,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        ante: room.ante,
        board: room.communityCards,
        pot: potTotal,
        rake: room.lastHandRake ?? 0,
        winners,
        winAmounts: winAmounts ?? {},
        handName: handInfo?.name,
        players,
        actions: room.actionLog ?? [],
        format: room.format,
      });
    }

    // Длительность шоудауна: успеваем показать карточку победителя + клиентскую анимацию
    // полёта фишек к центру (1.4s) + время на чтение крупных карт победителя. Таймер трекается
    // в room.showdownTimer/showdownEndsAt (не голый setTimeout) — нужен watchdog'у зависших
    // столов (tableWatchdog.ts), чтобы видеть дедлайн этой фазы тоже.
    scheduleShowdownTimer(room, 5000, () => this.cleanupHand(roomId));
  }

  // Очистка состояния после раздачи
  private cleanupHand(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Финальные стеки перед сбросом
    const finalStacks = Array.from(room.players.values())
      .map(p => `${p.username}=${p.chips}`)
      .join(', ');
    console.log(`🧹 [hand-end] table="${room.name}" final: ${finalStacks}${room.pot > 0 ? ` (pot ${room.pot} сгорает)` : ''}\n`);

    clearTurnTimers(room);
    clearShowdownTimer(room); // дедлайн шоудауна не должен «протухать» на следующую раздачу
    room.phase = 'waiting';
    room.status = 'waiting';
    room.pot = 0;
    room.communityCards = [];
    room.currentBet = 0;
    room.actionsThisRound = new Set();
    // Окно Rabbit Hunting закрыто — следующая раздача начнёт с чистого листа.
    room.rabbitHuntCards = undefined;
    room.rabbitHuntPrice = undefined;
    room.rabbitHuntPaidBy = new Set();

    // Таймбанк: считаем «руки за столом» для каждого сидящего игрока с chips>0
    // (банкрот auto-leave'нется ниже, ему счётчик трогать смысла нет).
    // Каждые bonusEveryHands рук — добавляем bonusSec, но не выше capSec.
    const tb = room.timebank;
    room.players.forEach(p => {
      p.cards = [];
      p.isFolded = false;
      p.currentBet = 0;
      if (tb.enabled && p.chips > 0) {
        p.handsAtTable++;
        if (tb.bonusEveryHands > 0 && p.handsAtTable % tb.bonusEveryHands === 0 && tb.bonusSec > 0) {
          const before = p.timebank;
          p.timebank = Math.min(tb.capSec, p.timebank + tb.bonusSec);
          if (p.timebank !== before) {
            console.log(`   ⏳ [timebank+] ${p.username}: ${before} → ${p.timebank}с (hands=${p.handsAtTable})`);
          }
        }
      }
    });

    // Раньше: this.persistRoomChips(room) синхронизировал стеки с банкроллом.
    // Сейчас банкролл и стек живут раздельно (списание на посадке, возврат на выходе),
    // поэтому здесь синкать не надо — стек продолжает жить в памяти Player.chips.
    // При рестарте/крэше стек восстанавливается из active-hands.json (см. activeHandPersistence.ts,
    // ROADMAP §9.2) — теряется только если процесс упал ДО следующего broadcastGameState.

    // Боты: фиксируем PnL раздачи в runtime + persist обновлённый стек.
    // Делаем ДО autoLeaveBrokePlayers (иначе бот удалится и runtime не успеет обновиться).
    room.players.forEach((p) => {
      if (this.isBot(p.id)) {
        this.botManager.onHandEnd(p.id, p.chips, room.bigBlind);
      }
    });

    // Люди: фиксируем результат раздачи (Рук/PnL) для админ-статистики (ROADMAP §10.10) +
    // рейкбэк (VIP-кэшбэк % от уплаченного рейка, ROADMAP «Рейкбэк»). statsRecorder — инжектированный
    // колбэк (тесты его не выставляют), рейкбэк работает независимо от него (своя enabled-настройка).
    const now = Date.now();
    const rakeTotal = room.lastHandRake ?? 0;
    // Рейк атрибутируем игрокам пропорционально вкладу в банк (totalCommitted ещё не сброшен).
    let totalCommit = 0;
    room.players.forEach((p) => { totalCommit += p.totalCommitted; });
    room.players.forEach((p) => {
      if (this.isBot(p.id) || p.handStartChips === undefined) return;
      const playerRake =
        rakeTotal > 0 && totalCommit > 0
          ? Math.round((rakeTotal * p.totalCommitted) / totalCommit)
          : 0;
      this.statsRecorder?.({
        t: now,
        roomId: room.id,
        userId: p.id,
        delta: p.chips - p.handStartChips,
        rake: playerRake,
        format: room.format,
      });
      if (playerRake > 0) {
        // Тихое начисление — без уведомления (на раскачанном столе рейк капает почти на каждой
        // раздаче, инбокс был бы залит спамом). Игрок смотрит накопленное на странице /rakeback.
        const rb = applyRakeback(p.id, room.id, playerRake);
        if (rb && rb.payout > 0) {
          p.chips += rb.payout;
        }
      }

      // Лимит на потери (ROADMAP §11.2) — только предупреждение, раздача не блокируется.
      // Раздача только что записана в statsRecorder выше — попадает в aggregateUserStats синхронно.
      if (this.settings.responsibleGambling.lossLimitEnabled) {
        const rg = getResponsibleGamblingState(p.id);
        if (rg.lossLimitCents) {
          const { sinceMs, key } = periodRange(rg.lossLimitPeriod ?? 'day', new Date(now));
          const { pnl } = aggregateUserStats(p.id, sinceMs, now);
          const lossCents = Math.max(0, -pnl);
          if (isLimitCrossed(lossCents, rg.lossLimitCents) && rg.lossWarnedPeriodKey !== key) {
            this.sendInboxNotification(p.id, 'rg-warning', 'Вы превысили установленный лимит на потери.');
            markResponsibleGamblingWarned(p.id, 'loss', key);
          }
        }
      }
    });

    // Авто-докупка стека — ДО autoLeaveBrokePlayers: долитый из банкролла игрок остаётся
    // за столом, а не вылетает как банкрот.
    this.performAutoTopUp(roomId);

    // Auto-leave: игроки, у которых стек обнулился, вылетают из комнаты
    this.autoLeaveBrokePlayers(roomId);

    this.broadcastGameState(roomId);
    this.notifyLobbyChange();

    // Между раздачами не показываем «Старт через N» — следующая раздача стартует мгновенно,
    // если за столом достаточно игроков. Countdown autostartDelayMs остаётся для первого
    // старта (стол наполняется до AUTO_START_MIN_PLAYERS через addPlayer).
    if (room.players.size >= room.autoStartPlayers && room.status === 'waiting') {
      this.startGame(roomId);
    } else {
      this.scheduleAutoStart(roomId);
    }
  }

  // Вывести из комнаты всех игроков с пустым стеком (sit-out / auto-leave).
  // Для ботов socket-уведомлений не делаем (у них нет сокета); BotManager среагирует через onBotLeaveRoom.
  private autoLeaveBrokePlayers(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const broke = Array.from(room.players.values()).filter(p => p.chips <= 0);
    if (room.tournamentId) {
      // Турнирные фишки — не банкролл: банкрот просто покидает стол (без возврата), финишную
      // позицию/выплату считает TournamentManager через onTournamentBust. killerIds — победители
      // ИМЕННО этой раздачи (lastHandWinners, см. endGame) — для атрибуции баунти.
      broke.forEach(p => {
        this.io.sockets.sockets.get(p.socketId)?.leave(roomId);
        room.players.delete(p.id);
        this.onTournamentBust?.(roomId, p.id, room.lastHandWinners ?? []);
      });
      return;
    }
    broke.forEach(p => {
      if (this.isBot(p.id)) return;
      this.io.to(p.socketId).emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'no-chips' });
      this.io.sockets.sockets.get(p.socketId)?.leave(roomId);
    });
    broke.forEach(p => this.removePlayer(roomId, p.id));
  }

  // Сохранить преференцию авто-докупки стека для сидящего игрока. Серверная санитизация
  // диапазона — клиенту по суммам не доверяем (§0). Применяется в cleanupHand между раздачами.
  setAutoTopUp(
    roomId: string,
    userId: string,
    cfg: { enabled: boolean; thresholdBb: number; targetBb: number },
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return;
    if (this.isBot(userId)) return; // у ботов своя логика пополнения (BotManager)
    if (!cfg || typeof cfg.enabled !== 'boolean') return;
    const maxBb = room.buyInMaxBb;
    const clamp = (v: number, lo: number, hi: number) =>
      Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;
    const thresholdBb = clamp(cfg.thresholdBb, 1, maxBb);
    // Цель не ниже порога и не выше максимального бай-ина стола.
    const targetBb = clamp(cfg.targetBb, thresholdBb, maxBb);
    player.autoTopUp = { enabled: cfg.enabled, thresholdBb, targetBb };
  }

  // Включить/выключить подсказку комбинации и шанса на выигрыш для игрока (тумблер в настройках).
  // При выключении сервер перестаёт считать его equity (экономия CPU) и не шлёт подсказки.
  setHandHint(roomId: string, userId: string, enabled: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return;
    if (player.wantsHint === enabled) return;
    player.wantsHint = enabled;
    room.equitySig = undefined; // форсируем пересчёт под новый набор «желающих»
    this.broadcastGameState(roomId);
  }

  // Добровольно показать свою карту после раздачи (тап по карте). Разрешено только в окне
  // showdown, своему игроку, с валидным индексом 0/1. Карта становится видна ВСЕМ (публичный
  // показ через shownCards в сериализаторе). Идемпотентно: повторный показ той же карты — no-op.
  showCard(roomId: string, userId: string, index: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.phase !== 'showdown') return; // только в окне после раздачи
    const player = room.players.get(userId);
    if (!player || player.cards.length < 2) return;
    if (index !== 0 && index !== 1) return;
    const revealed = player.revealedCards ?? [];
    if (revealed.includes(index)) return;
    player.revealedCards = [...revealed, index];
    this.broadcastGameState(roomId);
  }

  // Rabbit Hunting (§10.12, платная фича): любой сидящий за столом (вкл. сфолдивших) может за плату
  // увидеть карты, которые пришли бы. Окно — только пока phase==='showdown' (room.rabbitHuntCards
  // выставлен в endGame и сброшен в cleanupHand). Идемпотентно: повторный запрос не списывает дважды.
  // Списание — из стека (player.chips), как любая другая ставка; лог в statsRecorder как rake-like
  // запись (попадает в существующую рейк-статистику админки «Данные», без новой инфраструктуры).
  requestRabbitHunt(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return; // не за этим столом (наблюдатели — room.observers, сюда не попадают)
    if (!canPayRabbitHunt(room.phase, room.rabbitHuntPrice, room.rabbitHuntCards, room.rabbitHuntPaidBy.has(userId), player.chips)) {
      return;
    }
    const price = room.rabbitHuntPrice!;

    player.chips -= price;
    room.rabbitHuntPaidBy.add(userId);
    this.statsRecorder?.({
      t: Date.now(),
      roomId: room.id,
      userId,
      delta: -price,
      rake: price,
      format: room.format,
    });
    console.log(`🐇 [rabbit-hunt] ${player.username} платит ${price} за раскрытие карт на столе "${room.name}"`);
    this.broadcastGameState(roomId);
  }

  // Авто-докупка стека между раздачами: для сидящих людей с включённой преференцией, у кого
  // стек опустился ниже порога, доливаем из свободного банкролла до целевого уровня (с лимитом
  // максимального бай-ина стола). Списание/начисление — только через BankrollService (§0.4),
  // он же шлёт BANKROLL_UPDATE. Вызывается из cleanupHand при room.status==='waiting'.
  private performAutoTopUp(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return;
    const maxBuyIn = room.bigBlind * room.buyInMaxBb;

    for (const [userId, player] of room.players) {
      const cfg = player.autoTopUp;
      if (!cfg || !cfg.enabled) continue;
      if (this.isBot(userId) || player.disconnected) continue;

      const thresholdChips = cfg.thresholdBb * room.bigBlind;
      if (player.chips >= thresholdChips) continue;

      const targetChips = Math.min(cfg.targetBb * room.bigBlind, maxBuyIn);
      const deficit = targetChips - player.chips;
      if (deficit <= 0) continue;

      const bankroll = this.bankroll.getUserChips(userId);
      if (bankroll === null || bankroll <= 0) continue;

      const amount = Math.min(deficit, bankroll);
      if (amount <= 0) continue;

      player.chips += amount;
      this.bankroll.persistChips(userId, bankroll - amount);
      console.log(
        `🔄 [auto-topup] ${player.username} +${amount} → стек ${player.chips} (банкролл ${bankroll} → ${bankroll - amount})`,
      );
    }
  }

  // Разместить ставку
  private placeBet(room: Room, userId: string, amount: number): void {
    const player = room.players.get(userId);
    if (!player) return;

    const actualAmount = Math.min(amount, player.chips);
    player.chips -= actualAmount;
    player.currentBet += actualAmount;
    player.totalCommitted += actualAmount;
    room.pot += actualAmount;
  }

  // Внести анте (POKER_RULES §6.7). В банк и в side-pot учёт (totalCommitted), но НЕ в
  // currentBet — анте не часть колла текущей улицы. Короткий стек вносит сколько может (all-in).
  private postAnte(room: Room, userId: string, amount: number): void {
    const player = room.players.get(userId);
    if (!player || amount <= 0) return;
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.totalCommitted += actual;
    room.pot += actual;
  }

  // Запланировать авто-закрытие стола по истечении длительности сессии.
  // Если включено автопродление — вместо закрытия сдвигаем sessionEndsAt на ту же длительность
  // и планируем заново (повторяется бесконечно, пока тоггл включён).
  private scheduleSessionClose(room: Room): void {
    if (!room.sessionEndsAt) return;
    const ms = Math.max(0, room.sessionEndsAt - Date.now());
    scheduleSessionTimer(room, ms, () => {
      if (room.autoExtendSession && room.sessionDurationHours > 0) {
        console.log(`⏰ [session-end] стол "${room.name}" автопродлён на ${room.sessionDurationHours} ч`);
        room.sessionEndsAt = Date.now() + room.sessionDurationHours * 3600 * 1000;
        this.saveRoomsSnapshot();
        this.scheduleSessionClose(room);
        return;
      }
      console.log(`⏰ [session-end] стол "${room.name}" закрыт по длительности`);
      this.adminForceCloseRoom(room.id);
    });
  }

  // Получить игрока по позиции
  private getPlayerAt(room: Room, index: number): Player | null {
    const ids = Array.from(room.players.keys());
    if (index >= ids.length) return null;
    return room.players.get(ids[index]) || null;
  }

  // Отправить состояние игры — per-socket, чтобы карты соперников не утекали обычным игрокам.
  // Каждому подписчику комнаты считаем персональный state с учётом его viewerId и admin-peek.
  // Оптимизация (см. perf-audit 2026-05-26): раньше getGameState вызывался N раз (по числу
  // сокетов в комнате), каждый раз пересобирал массив players с .map. На 9-max столе ×
  // 13 broadcast'ов/раздача = 117 объектов state. Теперь:
  // - На showdown все видят одинаковое — 1 emit через io.to(room).
  // - Иначе base-state (всем cards=[]) строится 1 раз, для каждого сокета дешёвый shallow
  //   clone с override своих карт. Peek-сокеты — отдельная сборка (редко, только админы).
  // Пересчёт шанса на выигрыш (winChance, 0..100) для активных игроков, ВКЛЮЧИВШИХ подсказку.
  // Мемоизировано по сигнатуре (фаза + борд + активные + желающие): пересчёт только когда что-то
  // из этого изменилось (смена улицы, фолд, посадка/уход, переключение тумблера) — не на каждый
  // broadcast. Equity считается против СЛУЧАЙНЫХ рук (без знания чужих карт, §0.1). Боты пропускаются.
  private updateEquities(room: Room): void {
    const active = Array.from(room.players.values()).filter((p) => !p.isFolded && p.cards.length === 2);
    const wanters = active.filter((p) => p.wantsHint && !this.isBot(p.id));
    const sig =
      room.phase + '|' +
      room.communityCards.map((c) => c.rank + c.suit).join('') + '|' +
      active.map((p) => p.id).sort().join(',') + '|' +
      wanters.map((p) => p.id).sort().join(',');
    if (room.equitySig === sig) return;
    room.equitySig = sig;

    for (const p of room.players.values()) p.winChance = undefined;
    if (room.phase === 'waiting' || room.phase === 'showdown') return;
    if (active.length === 1) { active[0].winChance = 100; return; }
    if (wanters.length === 0) return;

    const numOpp = active.length - 1;
    for (const p of wanters) {
      p.winChance = Math.round(
        winProbabilityVsRandom(p.cards, room.communityCards, numOpp, EQUITY_ITERATIONS, Math.random, room.format) * 100,
      );
    }
  }

  private broadcastGameState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    // Любое значимое изменение раздачи проходит через этот метод — отметка для watchdog'а
    // зависших столов (tableWatchdog.ts): пока broadcastGameState вызывается, раздача жива.
    room.lastProgressAt = Date.now();
    // Снимок активной раздачи — ДО проверки сокетов (рестарт-восстановление §9.2: сразу
    // после холодного старта в комнате 0 сокетов, но состояние всё равно должно персистнуться).
    this.persistActiveHands();
    const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets || roomSockets.size === 0) return;

    // Обновляем шансы на выигрыш (мемоизировано — пересчёт только на смене улицы/состава/желающих).
    this.updateEquities(room);

    const isShowdown = room.phase === 'showdown';

    // Базовый state — без карт ни у кого (canSeeCards=false для всех в getGameState).
    const baseState = this.getGameState(roomId);
    if (!baseState) return;

    roomSockets.forEach((sid) => {
      const sock = this.io.sockets.sockets.get(sid);
      if (!sock) return;
      const viewer = sock.data?.user as { id: string } | undefined;
      const withPeek = this.adminPeekSockets.has(sid);

      if (withPeek || isShowdown) {
        // Peek (карты всех + futureBoard) ИЛИ showdown — полный пересбор per-socket: каждый видит
        // свои карты + на showdown карты только дошедших до вскрытия (не сфолдивших, §0.1) + добровольно
        // показанные. Редкий путь (peek — только админ; showdown — раз за раздачу).
        const fullState = this.getGameState(roomId, viewer?.id, withPeek);
        if (fullState) sock.emit(SOCKET_EVENTS.GAME_UPDATE, fullState);
        return;
      }

      const myPlayer = viewer ? room.players.get(viewer.id) : undefined;
      if (!myPlayer) {
        // Наблюдатель / не игрок — отдаём base без карт.
        sock.emit(SOCKET_EVENTS.GAME_UPDATE, baseState);
        return;
      }

      // Подсказка комбинации/шансов — только если этот игрок её включил (§0.1: своё место).
      const myHint = myPlayer.wantsHint && !myPlayer.isFolded
        ? handHintName(myPlayer.cards, room.communityCards, room.format)
        : undefined;
      const myWin = myPlayer.wantsHint ? myPlayer.winChance : undefined;
      // Shallow clone + override карт/подсказок только для своего игрока.
      const personalized = {
        ...baseState,
        players: baseState.players.map((p) =>
          p.id === viewer!.id
            ? { ...p, cards: myPlayer.cards, handHint: myHint, winChance: myWin }
            : p,
        ),
      };
      sock.emit(SOCKET_EVENTS.GAME_UPDATE, personalized);
    });
  }

  // Текущее состояние игры для конкретного зрителя.
  // - viewerId: получит свои карты (если у него есть). На showdown все карты раскрываются всем.
  // - withPeek: режим «глаз админа» — все карты + futureBoard. Caller обязан проверить роль.
  // Без аргументов (legacy) — карт нет ни у кого вне showdown. Это безопасный дефолт.
  getGameState(roomId: string, viewerId?: string, withPeek = false): SharedGameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    // §0.1 защита карт — в чистом gameStateSerializer (см. там).
    return serializeGameState(room, viewerId, withPeek);
  }

  // Текущее время окончания countdown (для запрашивающего)
  getCountdownEndsAt(roomId: string): number | null {
    return this.rooms.get(roomId)?.startCountdownEndsAt ?? null;
  }

  // ===== Admin API =====

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  // Обновить настройки в памяти + записать в файл. Применяются к следующим действиям.
  // Существующие активные таймеры (turn/autostart) доиграют по старым значениям,
  // существующие комнаты сохраняют свой timebank (он скопирован в момент createRoom).
  // Для timebank, botMode и paidFeatures — глубокий merge (частичное обновление вложенных блоков).
  updateSettings(partial: Partial<GameSettings>): GameSettings {
    const nextTb: TimebankSettings = partial.timebank
      ? { ...this.settings.timebank, ...partial.timebank }
      : this.settings.timebank;
    const nextBm: BotModeSettings = partial.botMode
      ? { ...this.settings.botMode, ...partial.botMode }
      : this.settings.botMode;
    const nextPf: PaidFeaturesSettings = partial.paidFeatures
      ? { rabbitHunt: { ...this.settings.paidFeatures.rabbitHunt, ...(partial.paidFeatures.rabbitHunt ?? {}) } }
      : this.settings.paidFeatures;
    const nextPm: PaymentsSettings = partial.payments
      ? {
          ...this.settings.payments,
          ...partial.payments,
          chains: { ...this.settings.payments.chains, ...(partial.payments.chains ?? {}) },
        }
      : this.settings.payments;
    const nextRg: ResponsibleGamblingSettings = partial.responsibleGambling
      ? { ...this.settings.responsibleGambling, ...partial.responsibleGambling }
      : this.settings.responsibleGambling;
    this.settings = { ...this.settings, ...partial, timebank: nextTb, botMode: nextBm, paidFeatures: nextPf, payments: nextPm, responsibleGambling: nextRg };
    writeJSON('settings.json', this.settings);
    return { ...this.settings };
  }

  // Детальный список комнат для админ-панели.
  // Отдаём isBotTable — админу нужно видеть, какие столы автоматические.
  getAdminRoomList(): AdminRoomView[] {
    return Array.from(this.rooms.values()).map(room => toAdminRoom(room, (id) => this.isBot(id)));
  }

  // Экспозиция BotManager для admin endpoints
  getBotManager(): BotManager {
    return this.botManager;
  }

  // Админский kick: уведомить игрока и удалить
  // Временный кик: убрать со стола + (опц.) закрыть повторный вход на cooldownMin минут.
  // cooldownMin<=0 — мгновенный кик без блокировки (как раньше). Это НЕ бан аккаунта:
  // игрок остаётся залогинен и может сесть за другой стол / за этот по истечении кулдауна.
  adminKickPlayer(roomId: string, userId: string, cooldownMin = 0): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const player = room.players.get(userId);
    if (!player) return false;

    // Кулдаун ставим ДО removePlayer: если игрок был последним, removePlayer удалит комнату —
    // тогда блокировать нечего (стол исчез), а запись уйдёт вместе с комнатой.
    const mins = Math.max(0, Math.min(1440, Math.floor(cooldownMin)));
    if (mins > 0) {
      const until = Date.now() + mins * 60 * 1000;
      room.kickCooldowns.set(userId, until);
      // Подчистить запись по истечении (ленивая очистка в canJoinRoom — подстраховка).
      setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (r && r.kickCooldowns.get(userId) === until) r.kickCooldowns.delete(userId);
      }, mins * 60 * 1000);
    }

    // Уведомить и отписать от socket-room (если онлайн)
    this.io.to(player.socketId).emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'kicked' });
    this.io.sockets.sockets.get(player.socketId)?.leave(roomId);

    this.removePlayer(roomId, userId);
    return true;
  }

  // Остаток кулдауна (мс) для игрока за столом — для сообщения «попробуйте через N мин».
  kickCooldownRemainingMs(roomId: string, userId: string): number {
    const until = this.rooms.get(roomId)?.kickCooldowns.get(userId);
    if (until === undefined) return 0;
    return Math.max(0, until - Date.now());
  }

  // Compliance-кик (ROADMAP §11.2): самоисключение/тайм-аут активированы прямо сейчас —
  // игрока нужно немедленно вышибить из-за стола(ов), а не ждать следующего реконнекта.
  // Рвём ВСЕ его сокеты тем же путём, что и single-session кик — обычный 'disconnect'
  // handler сам корректно посадит игрока в сит-аут/уберёт со стола (как при разрыве сети).
  kickUserForCompliance(userId: string, reason: 'self-excluded' | 'timeout', until: string): void {
    forceDisconnectOtherSessions(this.io, userId, { reason, until });
  }

  // Revoke сессии («Мои устройства», ROADMAP §10.15) — рвёт сокет только этой сессии,
  // не трогая другие активные устройства того же юзера.
  revokeUserSession(sid: string): void {
    disconnectSocketsBySid(this.io, sid);
  }

  // Админский force-close: уведомить всех и удалить комнату.
  // Для ботов — socket-уведомлений нет, отвязка через BotManager.onBotLeaveRoom.
  adminForceCloseRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    this.io.to(roomId).emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'closed' });

    room.players.forEach(p => {
      if (!this.isBot(p.id)) {
        this.io.sockets.sockets.get(p.socketId)?.leave(roomId);
        clearDisconnectTimer(p);
      } else {
        this.botManager.onBotLeaveRoom(p.id);
      }
      const bankroll = this.bankroll.getUserChips(p.id) ?? 0;
      this.bankroll.persistChips(p.id, bankroll + p.chips);
    });

    clearTurnTimers(room);
    clearStartTimer(room);
    clearSessionTimer(room);
    clearShowdownTimer(room);
    const wasBotTable = room.isBotTable;
    this.rooms.delete(roomId);
    if (wasBotTable) this.botManager.onTableClosed(roomId);
    this.notifyLobbyChange();
    this.saveRoomsSnapshot();
    return true;
  }

  // ===== GameManagerForBots interface implementation =====

  hasOpenAutoBotTable(level: 'micro' | 'low' | 'mid'): boolean {
    for (const r of this.rooms.values()) {
      if (r.isBotTable && r.botTableLevel === level) return true;
    }
    return false;
  }

  // Создать стол под автоматический бот-режим. Без validateCreateOptions (валидация выше).
  createBotTable(opts: {
    level: 'micro' | 'low' | 'mid';
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
  }): string | null {
    const roomId = nanoid(10);
    this.rooms.set(roomId, makeRoom({
      id: roomId,
      name: opts.name,
      description: '',
      createdBy: 'system',
      maxPlayers: opts.maxPlayers,
      passwordHash: null,
      smallBlind: opts.smallBlind,
      bigBlind: opts.bigBlind,
      turnDurationMs: 20000,
      buyInMinBb: 20,
      buyInMaxBb: 200,
      timebank: toRoomTimebank(this.settings.timebank),
      rake: { percent: 0, capBb: 0 }, // бот-столы без рейка
      ante: 0,
      format: 'nlh', // бот-столы пока только NLH
      autoStartPlayers: AUTO_START_MIN_PLAYERS,
      sessionDurationHours: 0, // бот-столы без авто-закрытия
      sitOutTimeoutMin: 30, // не используется (боты не дисконнектятся), но поле обязательно
      waitlistDelayMin: 2, // не используется (на бот-столы не встают в очередь), но поле обязательно
      isBotTable: true,
      botTableLevel: opts.level,
    }));
    this.notifyLobbyChange();
    this.saveRoomsSnapshot();
    return roomId;
  }

  // Посадить бота за стол (минуя проверки бай-ина — у бота свой пул).
  // chips на столе = buyIn; bot.chips (free bankroll) уменьшается на buyIn.
  seatBot(roomId: string, bot: BotInfo, buyIn: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.has(bot.id)) return false;
    if (room.players.size >= room.maxPlayers) return false;
    if (bot.chips < buyIn) return false;

    // Списать buyIn из bot.chips
    this.bankroll.persistChips(bot.id, bot.chips - buyIn);

    const playerCount = room.players.size;
    const midHandEntry = room.status === 'playing';
    const player = createPlayer({
      id: bot.id,
      socketId: '',           // у бота нет socket — пустая строка
      username: bot.username,
      chips: buyIn,
      position: playerCount,
      isFolded: midHandEntry,
      timebank: room.timebank.enabled ? room.timebank.startSec : 0,
    });
    room.players.set(bot.id, player);
    console.log(`🤖 [seat-bot] ${bot.username} → ${room.name} buy-in=${buyIn}`);
    this.broadcastGameState(roomId);
    this.notifyLobbyChange();
    this.scheduleAutoStart(roomId);
    return true;
  }

  isRoomActive(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  // Убрать одного бота со стола, только между раздачами. Возвращает true если убрал.
  // chips бота уже сохранены через onHandEnd → persistBotChips после последней раздачи.
  removeBotFromTable(roomId: string, botId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.players.has(botId)) return false;
    if (room.status === 'playing') return false;
    this.removePlayer(roomId, botId); // вызывает onBotLeaveRoom внутри
    return true;
  }

  forceCloseRoom(roomId: string): boolean {
    return this.adminForceCloseRoom(roomId);
  }

  // Собрать контекст для botBrain.decideAction
  buildBotContext(roomId: string, botId: string): BotDecisionContext | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.get(botId);
    if (!player) return null;
    const meta = this.botManager.getBotMeta(botId);
    if (!meta) return null;

    const activeOpponents = Array.from(room.players.values())
      .filter((p) => p.id !== botId)
      .map((p) => ({
        id: p.id,
        cards: p.cards,
        chips: p.chips,
        currentBet: p.currentBet,
        isFolded: p.isFolded,
        isBot: this.isBot(p.id),
      }));

    return {
      myCards: player.cards,
      myCurrentBet: player.currentBet,
      myChips: player.chips,
      board: room.communityCards,
      pot: room.pot,
      currentBet: room.currentBet,
      phase: room.phase,
      bigBlind: room.bigBlind,
      activeOpponents,
      futureBoard: getFutureBoardCards(room.deck, room.communityCards.length),
      persona: meta.bot.persona,
      targetPnL: meta.bot.targetPnL,
      runtime: meta.runtime,
      lifetimePnL: meta.bot.totalPnL,
      peekMode: this.settings.botMode.peekMode,
      rng: this.botManager.makeRngForHand(botId, room.handIndex),
    };
  }

  // Применить решение бота — идёт через тот же handlePlayerAction (внутренние invariants сохранены)
  applyBotAction(roomId: string, botId: string, decision: BotDecision): void {
    this.handlePlayerAction(roomId, botId, decision.action, decision.amount);
  }
}
import { Server, Socket } from 'socket.io';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { createDeck, shuffleDeck, dealCards, dealCommunityCards, getFutureBoardCards } from './deck.js';
import { evaluateHand, determineWinner, formatHandName } from './hands.js';
import { readJSON, writeJSON } from '../auth/storage.js';
import { BotManager, type GameManagerForBots, type BotInfo, type BotModeSettings } from './BotManager.js';
import type { BotDecisionContext, BotDecision } from './botBrain.js';
import { toRoomTimebank, validateTimebankConfig, validateCreateOptions } from './roomValidation.js';
import { createPlayer } from './playerFactory.js';
import { makeRoom } from './roomFactory.js';
import { BankrollService } from './bankrollService.js';
import { toRoomInfo, toAdminRoom, type AdminRoomView } from './roomSerializers.js';
import { isLegalRaise } from './bettingRules.js';
import { isRoundComplete } from './phaseRules.js';
import type { Suit, Rank, Card, GamePhase, RoomStatus } from './types.js';
import { isBot as isBotId } from './botIdentity.js';
import { serializeGameState } from './gameStateSerializer.js';

// Базовые типы (Suit/Rank/Card/GamePhase/RoomStatus) — из канонического game/types.ts
// (§9.3-A: локальные копии убраны). Доменные типы ниже (Player/GameState/Room/...) пока локальны —
// дубль shared/index.ts, синхронизировать вручную (cross-dir импорт типов на сервере не работает, см. 8.3).

export interface Player {
  id: string;            // userId из JWT (стабильный между переподключениями)
  socketId: string;      // текущий socket.id (обновляется на reconnect)
  username: string;
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
}

// Публичная вьюшка игрока — то, что уходит клиенту в GameState. Без серверных полей
// (socketId, таймеры, handsAtTable, totalCommitted). См. §0.1: лишнего клиенту не отдаём.
interface PublicPlayer {
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
  timebank?: number;
}

export interface GameState {
  roomId: string;
  roomName: string;
  players: PublicPlayer[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  phase: GamePhase;
  winners: Player[] | null;
  turnEndsAt: number | null;
  turnDurationSec: number;
  turnTimebankEndsAt: number | null;
  turnTimebankStartedAt: number | null;
  timebankEnabled: boolean;
  smallBlind: number;
  bigBlind: number;
  futureBoard?: Card[]; // только для admin-peek
}

// Конфигурация таймбанка для стола (дубль shared/TimebankConfig — синхронизировать вручную)
export interface TimebankConfig {
  enabled: boolean;
  startSec: number;
  bonusSec: number;
  bonusEveryHands: number;
  capSec: number;
}

// Глобальные настройки таймбанка (живут в settings.json)
export interface TimebankSettings extends TimebankConfig {
  allowPerTableOverride: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  description: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  currentPlayers: number;
  hasPassword: boolean;
  status: RoomStatus;
  createdBy: string;
  playerIds: string[];
  players: Array<{ id: string; username: string }>;
  turnDurationSec: number;
  buyInMinBb: number;
  buyInMaxBb: number;
  timebank: TimebankConfig;
}

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
}

type JoinDeniedReason =
  | 'not-found'
  | 'wrong-password'
  | 'password-required'
  | 'full'
  | 'in-game'
  | 'kicked'
  | 'closed'
  | 'no-chips'
  | 'insufficient-bankroll'
  | 'invalid-buyin';

const SOCKET_EVENTS = {
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
  PLAYER_ACTION_BROADCAST: 'playerActionBroadcast',
  SEND_EMOJI: 'sendEmoji',
  EMOJI_BROADCAST: 'emojiBroadcast',
  BANKROLL_UPDATE: 'bankrollUpdate',
  ADMIN_PEEK_TOGGLE: 'adminPeekToggle',
  REQUEST_GAME_STATE: 'requestGameState',
  FORCE_DISCONNECT: 'forceDisconnect',
} as const;

const DISCONNECT_GRACE_MS = 30000;
const AUTO_START_MIN_PLAYERS = 2; // автостарт всегда от 2 игроков (per-table настройка не делается, см. CLAUDE.md)

interface GameSettings {
  turnDurationMs: number;
  autostartDelayMs: number;
  defaultPlayerChips: number;
  timebank: TimebankSettings;
  botMode: BotModeSettings;
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
  botsPerTable: 3,
  defaultBuyInBb: 100,
  refillIntervalMs: 120000,
};

const DEFAULT_SETTINGS: GameSettings = {
  turnDurationMs: 30000,
  autostartDelayMs: 10000,
  defaultPlayerChips: 1000,
  timebank: { ...DEFAULT_TIMEBANK },
  botMode: { ...DEFAULT_BOT_MODE },
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
  isBotTable: boolean;                      // автоматически созданный стол режима ботов
  botTableLevel?: 'micro' | 'low' | 'mid';  // профиль уровня (для refill)
  handIndex: number;                        // счётчик раздач за столом (для seeded RNG ботов)
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
          isBotTable: !!s.isBotTable,
          botTableLevel: s.botTableLevel,
        }));
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
      isBotTable: r.isBotTable,
      botTableLevel: r.botTableLevel,
    }));
    try {
      writeJSON('rooms.json', snapshots);
    } catch {}
  }

  private loadSettings(): GameSettings {
    try {
      const data = readJSON('settings.json') as Partial<GameSettings>;
      // Глубокий merge для вложенного timebank блока (иначе spread затрёт частично заданный)
      const tb: TimebankSettings = { ...DEFAULT_TIMEBANK, ...(data.timebank ?? {}) };
      return { ...DEFAULT_SETTINGS, ...data, timebank: tb };
    } catch {
      return { ...DEFAULT_SETTINGS, timebank: { ...DEFAULT_TIMEBANK } };
    }
  }

  // Создать комнату
  createRoom(options: CreateRoomOptions, createdBy: string): { roomId: string } | { error: string } {
    const validationError = validateCreateOptions(options);
    if (validationError) {
      return { error: validationError };
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
      isBotTable: false,
    }));

    this.notifyLobbyChange();
    this.saveRoomsSnapshot();
    return { roomId };
  }

  // Проверка возможности войти в комнату.
  // Если userId уже в players — это реконнект, пропускаем все проверки кроме существования.
  // Late entry: если комната в playing-фазе, новый игрок добавляется как folded на текущую
  // раздачу и получит карты со следующей (см. addPlayer).
  canJoinRoom(roomId: string, userId: string, password?: string, buyInAmount?: number): JoinDeniedReason | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'not-found';
    if (room.players.has(userId)) return null;
    if (room.players.size >= room.maxPlayers) return 'full';
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
    } catch {}
  }

  // Список комнат для лобби (без паролей).
  // ВАЖНО: НЕ отдаём isBotTable — игроки не должны видеть, какие столы автоматические.
  getRoomList(): RoomInfo[] {
    return Array.from(this.rooms.values()).map(toRoomInfo);
  }

  // Бродкаст списка комнат подписчикам лобби
  private notifyLobbyChange(): void {
    this.io.to(LOBBY_ROOM).emit(SOCKET_EVENTS.ROOM_LIST, this.getRoomList());
  }

  // Запустить/перезапустить/отменить таймер автостарта
  private scheduleAutoStart(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.startTimer) {
      clearTimeout(room.startTimer);
      room.startTimer = null;
      room.startCountdownEndsAt = null;
    }

    if (room.status !== 'waiting' || room.players.size < AUTO_START_MIN_PLAYERS) {
      this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { endsAt: null });
      return;
    }

    const endsAt = Date.now() + this.settings.autostartDelayMs;
    room.startCountdownEndsAt = endsAt;
    room.startTimer = setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r) return;
      r.startTimer = null;
      r.startCountdownEndsAt = null;
      if (r.status === 'waiting' && r.players.size >= AUTO_START_MIN_PLAYERS) {
        this.startGame(roomId);
      }
    }, this.settings.autostartDelayMs);

    this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { endsAt });
  }

  // Добавить игрока или обработать реконнект (комната должна существовать).
  // buyInAmount — запрошенная сумма для посадки (в чипсах). Если не передана — fallback:
  // min(maxBuyIn, bankroll), что близко к старому поведению (сесть с максимумом).
  addPlayer(roomId: string, userId: string, socketId: string, username: string, buyInAmount?: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Реконнект: тот же userId уже в комнате — стек на столе сохраняется
    const existing = room.players.get(userId);
    if (existing) {
      existing.socketId = socketId;
      existing.disconnected = false;
      if (existing.disconnectTimer) {
        clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = null;
      }
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

    const player = room.players.get(userId);
    if (player) {
      // Вернуть остаток стека со стола в банкролл.
      // Банкролл и стек живут раздельно: на посадке списали, на выходе возвращаем.
      const bankroll = this.bankroll.getUserChips(userId) ?? 0;
      console.log(`🚪 [leave] ${player.username} ← table "${room.name}" took=${player.chips} (bankroll ${bankroll} → ${bankroll + player.chips})`);
      this.bankroll.persistChips(userId, bankroll + player.chips);
      if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    }
    room.players.delete(userId);

    // Бот ушёл — отвязать от стола, отменить pending decision
    if (this.isBot(userId)) {
      this.botManager.onBotLeaveRoom(userId);
    }

    if (room.players.size === 0) {
      if (room.startTimer) clearTimeout(room.startTimer);
      const wasBotTable = room.isBotTable;
      this.rooms.delete(roomId);
      if (wasBotTable) this.botManager.onTableClosed(roomId);
      this.saveRoomsSnapshot();
    } else {
      this.broadcastGameState(roomId);
      this.scheduleAutoStart(roomId);
    }
    this.notifyLobbyChange();
  }

  // Мягкий дисконнект: в waiting — сразу удалить, в playing — пометить + таймер 30с
  handleDisconnect(userId: string): void {
    this.rooms.forEach((room, roomId) => {
      const player = room.players.get(userId);
      if (!player) return;

      if (room.status === 'waiting') {
        this.removePlayer(roomId, userId);
        return;
      }

      // В игре — grace-период. НЕ авто-фолдим даже если сейчас его ход:
      // turn-таймер уже считает время и сам сделает auto-CHECK (если call=0) или auto-FOLD
      // по истечении. Это даёт игроку шанс восстановиться при F5/реконнекте без потери раздачи.
      // Стол не «зависает», потому что turn-таймер ограничивает ожидание сверху.
      player.disconnected = true;
      this.broadcastGameState(roomId);

      // Через 30с — удалить из комнаты (grace-период).
      if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      player.disconnectTimer = setTimeout(() => {
        const r = this.rooms.get(roomId);
        const p = r?.players.get(userId);
        if (p && p.disconnected) {
          this.removePlayer(roomId, userId);
        }
      }, DISCONNECT_GRACE_MS);
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
      clearTimeout(room.startTimer);
      room.startTimer = null;
      room.startCountdownEndsAt = null;
      this.io.to(roomId).emit(SOCKET_EVENTS.START_COUNTDOWN, { endsAt: null });
    }

    const deck = testDeck ?? shuffleDeck(createDeck());
    const playerIds = Array.from(room.players.keys());

    // Раздача карт
    const { hands, remainingDeck } = dealCards(deck, playerIds.length);

    playerIds.forEach((id, i) => {
      const player = room.players.get(id)!;
      player.cards = hands[i];
      player.isFolded = false;
      player.currentBet = 0;
      player.totalCommitted = 0;
    });

    room.deck = remainingDeck;
    room.communityCards = [];
    room.pot = 0;
    room.currentBet = room.bigBlind;
    room.phase = 'preflop';
    room.status = 'playing';
    room.actionsThisRound = new Set();
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

    if (smallBlindPlayer) {
      this.placeBet(room, smallBlindPlayer.id, room.smallBlind);
      console.log(`   💰 [blind] SB ${smallBlindPlayer.username} → ${room.smallBlind} (pot=${room.pot})`);
    }
    if (bigBlindPlayer) {
      this.placeBet(room, bigBlindPlayer.id, room.bigBlind);
      console.log(`   💰 [blind] BB ${bigBlindPlayer.username} → ${room.bigBlind} (pot=${room.pot})`);
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
    this.clearTurnTimer(room);

    let broadcastAmount: number | undefined;

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
        if (!isLegalRaise(amount, room.currentBet, room.bigBlind, player.chips, player.currentBet)) return;
        const to = amount as number;
        const delta = to - player.currentBet;
        room.currentBet = to;
        this.placeBet(room, userId, delta);
        // Рейз сбрасывает круг — остальным нужен новый ход
        room.actionsThisRound = new Set([userId]);
        broadcastAmount = to; // итоговый размер ставки (raise to)
        console.log(`   ▶ [${room.phase}] ${player.username} RAISE to ${to} (+${delta}) (chips=${player.chips} pot=${room.pot})`);
        break;
      }
      case 'all-in': {
        const before = player.chips;
        this.placeBet(room, userId, player.chips);
        if (player.currentBet > room.currentBet) {
          room.currentBet = player.currentBet;
          room.actionsThisRound = new Set([userId]);
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

  // Сбросить оба таймера хода (основной + таймбанк) — после действия / смены фазы / cleanup
  private clearTurnTimer(room: Room): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    if (room.timebankTimer) {
      clearTimeout(room.timebankTimer);
      room.timebankTimer = null;
    }
    room.turnEndsAt = null;
    room.turnTimebankEndsAt = null;
    room.turnTimebankStartedAt = null;
    room.turnTimebankPlayerId = null;
  }

  // Phase 1: основной таймер хода. По истечении — если у игрока есть таймбанк, запускаем Phase 2;
  // иначе сразу auto-fold.
  private startTurnTimer(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.clearTurnTimer(room);
    room.turnEndsAt = Date.now() + room.turnDurationMs;
    room.turnTimer = setTimeout(() => {
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
    }, room.turnDurationMs);
  }

  // Phase 2: таймбанк-таймер. По истечении — обнуляем timebank игрока и auto-fold.
  private startTimebankTimer(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player || player.timebank <= 0) return;
    // Phase 1 истёк, очищаем основной timer (но НЕ через clearTurnTimer — она сбросит и Phase 2 поля).
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    room.turnEndsAt = null;
    const durMs = player.timebank * 1000;
    room.turnTimebankStartedAt = Date.now();
    room.turnTimebankEndsAt = Date.now() + durMs;
    room.turnTimebankPlayerId = userId;
    room.timebankTimer = setTimeout(() => {
      const t = this.timeoutTarget(roomId, userId);
      if (!t) return;
      t.player.timebank = 0;
      this.autoActOnTimeout(roomId, userId, t.room, t.player, 'timebank exhausted');
    }, durMs);
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
      this.clearTurnTimer(room);
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
      this.clearTurnTimer(room);
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
    this.clearTurnTimer(room);

    switch (room.phase) {
      case 'preflop': {
        const flop = dealCommunityCards(room.deck, 3);
        room.communityCards = flop.cards;
        room.deck = flop.remainingDeck;
        room.phase = 'flop';
        const cardsStr = flop.cards.map(c => c.rank + c.suit[0]).join(' ');
        console.log(`🌊 [flop] ${cardsStr} (pot=${room.pot})`);
        break;
      }
      case 'flop': {
        const turn = dealCommunityCards(room.deck, 1);
        room.communityCards = [...room.communityCards, ...turn.cards];
        room.deck = turn.remainingDeck;
        room.phase = 'turn';
        const cardsStr = turn.cards.map(c => c.rank + c.suit[0]).join(' ');
        console.log(`🌊 [turn] ${cardsStr} (board: ${room.communityCards.map(c => c.rank + c.suit[0]).join(' ')}, pot=${room.pot})`);
        break;
      }
      case 'turn': {
        const river = dealCommunityCards(room.deck, 1);
        room.communityCards = [...room.communityCards, ...river.cards];
        room.deck = river.remainingDeck;
        room.phase = 'river';
        const cardsStr = river.cards.map(c => c.rank + c.suit[0]).join(' ');
        console.log(`🌊 [river] ${cardsStr} (board: ${room.communityCards.map(c => c.rank + c.suit[0]).join(' ')}, pot=${room.pot})`);
        break;
      }
      case 'river':
        this.showdown(roomId);
        return;
    }

    room.currentPlayerIndex = (room.dealerIndex + 1) % room.players.size;
    this.broadcastGameState(roomId);
    this.emitCurrentTurn(roomId);
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
        const hr = evaluateHand(p.cards, room.communityCards);
        const handCards = p.cards.map(c => c.rank + c.suit[0]).join('');
        console.log(`   👁  ${p.username} hand=${handCards} → ${formatHandName(hr)}`);
      } catch {}
    });

    room.phase = 'showdown';

    // Side pots: разбиваем pot на слои по уровням commit активных игроков.
    // Каждый слой выигрывает лучшая рука из тех, кто внёс ≥ уровня слоя.
    // Алгоритм покрывает обычные раздачи (все equal commit → один слой = всё) и
    // multi-way all-in с разными стеками (несколько слоёв).
    const allPlayers = Array.from(room.players.values());
    const active = allPlayers.filter(p => !p.isFolded && p.cards.length > 0);
    const handInfo = this.distributePot(room, allPlayers, active);

    const allWinners = handInfo.winners;
    if (allWinners.length === 0) {
      console.log(`   💨 showdown без активных — pot ${room.pot} сгорает`);
    }

    this.endGame(roomId, allWinners, handInfo.handInfo);
  }

  // Разделение pot по side-слоям. Возвращает список всех уникальных победителей
  // (по всем слоям) + информацию о руке для отображения (берётся из главного слоя).
  // Параметры:
  //  - allPlayers: все игроки за столом (включая folded — их commits идут в pot)
  //  - active: игроки, претендующие на pot (не folded, есть карты)
  // Сторонние эффекты: начисляет chips победителям и обнуляет room.pot.
  private distributePot(
    room: Room,
    allPlayers: Player[],
    active: Player[],
  ): { winners: string[]; handInfo?: { name: string; cards: Card[] } } {
    if (active.length === 0) {
      room.pot = 0;
      return { winners: [] };
    }

    // Уровни commitments активных игроков — отсортированные и уникальные.
    // Folded в levels не входят, но их contribution учитывается в layerPot ниже.
    const levels = Array.from(new Set(active.map(p => p.totalCommitted))).sort((a, b) => a - b);
    const winnerSet = new Set<string>();
    let mainHandInfo: { name: string; cards: Card[] } | undefined;
    let prevLevel = 0;

    for (const level of levels) {
      const take = level - prevLevel;
      if (take <= 0) {
        prevLevel = level;
        continue;
      }

      // layerPot = сумма contributions всех игроков (включая folded) в этот слой
      let layerPot = 0;
      for (const p of allPlayers) {
        const contribution = Math.max(0, Math.min(take, p.totalCommitted - prevLevel));
        layerPot += contribution;
      }

      // Победители слоя — лучшая рука среди active с commit >= level
      const eligible = active.filter(p => p.totalCommitted >= level);
      const layerWinners = determineWinner(
        eligible.map(p => ({ id: p.id, hand: p.cards, folded: false })),
        room.communityCards,
      );

      if (layerWinners.length > 0 && layerPot > 0) {
        const share = Math.floor(layerPot / layerWinners.length);
        const remainder = layerPot - share * layerWinners.length;
        layerWinners.forEach((id, idx) => {
          const p = room.players.get(id);
          if (p) {
            // Остаток от деления отдаём первому победителю (стандартное правило split-pot)
            p.chips += share + (idx === 0 ? remainder : 0);
          }
          winnerSet.add(id);
        });

        // Информация о руке — из главного слоя (первый, обычно main pot)
        if (!mainHandInfo) {
          const firstWinner = room.players.get(layerWinners[0]);
          if (firstWinner && firstWinner.cards.length > 0) {
            const hr = evaluateHand(firstWinner.cards, room.communityCards);
            mainHandInfo = { name: formatHandName(hr), cards: hr.cards };
          }
        }

        const winnerNames = layerWinners.map(id => room.players.get(id)?.username ?? id).join(', ');
        const layerLabel = levels.length > 1 ? `[layer commit≤${level}]` : '';
        console.log(
          `   🥇 ${layerLabel} pot=${layerPot} → ${winnerNames} +${share}` +
          (layerWinners.length > 1 ? ` (split ${layerWinners.length}-way)` : ''),
        );
      }

      prevLevel = level;
    }

    room.pot = 0;
    return { winners: Array.from(winnerSet), handInfo: mainHandInfo };
  }

  // Конец раздачи: показываем шоудаун 5 сек, потом cleanup
  private endGame(roomId: string, winners: string[], handInfo?: { name: string; cards: Card[] }): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.clearTurnTimer(room);

    // Если endGame вызван не через showdown (все folded кроме одного) — забираем pot ему
    // (showdown сам бы это сделал, но endGame может прийти из nextPlayer "Only one active player left")
    if (room.phase !== 'showdown' && winners.length === 1 && room.pot > 0) {
      const winner = room.players.get(winners[0]);
      if (winner) {
        winner.chips += room.pot;
        console.log(`🏆 [uncontested] ${winner.username} забирает pot=${room.pot} (остальные folded)`);
        room.pot = 0;
      }
    }

    // Покажем финальную раздачу с открытыми картами и сообщим победителей
    room.phase = 'showdown';
    this.broadcastGameState(roomId);
    this.io.to(roomId).emit(SOCKET_EVENTS.GAME_WINNER, {
      winners,
      handName: handInfo?.name,
      winningCards: handInfo?.cards,
    });

    // Длительность шоудауна: успеваем показать карточку победителя + клиентскую анимацию
    // полёта фишек к центру (1.4s) + время на чтение крупных карт победителя.
    setTimeout(() => this.cleanupHand(roomId), 5000);
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

    this.clearTurnTimer(room);
    room.phase = 'waiting';
    room.status = 'waiting';
    room.pot = 0;
    room.communityCards = [];
    room.currentBet = 0;
    room.actionsThisRound = new Set();

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
    // Trade-off: при крэше сервера стек теряется (см. CLAUDE.md 9.2).

    // Боты: фиксируем PnL раздачи в runtime + persist обновлённый стек.
    // Делаем ДО autoLeaveBrokePlayers (иначе бот удалится и runtime не успеет обновиться).
    room.players.forEach((p) => {
      if (this.isBot(p.id)) {
        this.botManager.onHandEnd(p.id, p.chips, room.bigBlind);
      }
    });

    // Auto-leave: игроки, у которых стек обнулился, вылетают из комнаты
    this.autoLeaveBrokePlayers(roomId);

    this.broadcastGameState(roomId);
    this.notifyLobbyChange();

    // Между раздачами не показываем «Старт через N» — следующая раздача стартует мгновенно,
    // если за столом достаточно игроков. Countdown autostartDelayMs остаётся для первого
    // старта (стол наполняется до AUTO_START_MIN_PLAYERS через addPlayer).
    if (room.players.size >= AUTO_START_MIN_PLAYERS && room.status === 'waiting') {
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
    broke.forEach(p => {
      if (this.isBot(p.id)) return;
      this.io.to(p.socketId).emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'no-chips' });
      this.io.sockets.sockets.get(p.socketId)?.leave(roomId);
    });
    broke.forEach(p => this.removePlayer(roomId, p.id));
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
  private broadcastGameState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const roomSockets = this.io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets || roomSockets.size === 0) return;

    const isShowdown = room.phase === 'showdown';

    // Showdown: все видят все карты, один общий state → одна serialization в socket.io.
    if (isShowdown) {
      const state = this.getGameState(roomId);
      if (state) this.io.to(roomId).emit(SOCKET_EVENTS.GAME_UPDATE, state);
      return;
    }

    // Базовый state — без карт ни у кого (canSeeCards=false для всех в getGameState).
    const baseState = this.getGameState(roomId);
    if (!baseState) return;

    roomSockets.forEach((sid) => {
      const sock = this.io.sockets.sockets.get(sid);
      if (!sock) return;
      const viewer = sock.data?.user as { id: string } | undefined;
      const withPeek = this.adminPeekSockets.has(sid);

      if (withPeek) {
        // Peek = полный пересбор (карты всех + futureBoard). Редкий путь.
        const peekState = this.getGameState(roomId, viewer?.id, true);
        if (peekState) sock.emit(SOCKET_EVENTS.GAME_UPDATE, peekState);
        return;
      }

      const myPlayer = viewer ? room.players.get(viewer.id) : undefined;
      if (!myPlayer) {
        // Наблюдатель / не игрок — отдаём base без карт.
        sock.emit(SOCKET_EVENTS.GAME_UPDATE, baseState);
        return;
      }

      // Shallow clone + override cards только для своего игрока.
      const personalized = {
        ...baseState,
        players: baseState.players.map((p) =>
          p.id === viewer!.id ? { ...p, cards: myPlayer.cards } : p,
        ),
      };
      sock.emit(SOCKET_EVENTS.GAME_UPDATE, personalized);
    });
  }

  // Текущее состояние игры для конкретного зрителя.
  // - viewerId: получит свои карты (если у него есть). На showdown все карты раскрываются всем.
  // - withPeek: режим «глаз админа» — все карты + futureBoard. Caller обязан проверить роль.
  // Без аргументов (legacy) — карт нет ни у кого вне showdown. Это безопасный дефолт.
  getGameState(roomId: string, viewerId?: string, withPeek = false): GameState | null {
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
  // Для timebank и botMode — глубокий merge (частичное обновление вложенных блоков).
  updateSettings(partial: Partial<GameSettings>): GameSettings {
    const nextTb: TimebankSettings = partial.timebank
      ? { ...this.settings.timebank, ...partial.timebank }
      : this.settings.timebank;
    const nextBm: BotModeSettings = partial.botMode
      ? { ...this.settings.botMode, ...partial.botMode }
      : this.settings.botMode;
    this.settings = { ...this.settings, ...partial, timebank: nextTb, botMode: nextBm };
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
  adminKickPlayer(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const player = room.players.get(userId);
    if (!player) return false;

    // Уведомить и отписать от socket-room (если онлайн)
    this.io.to(player.socketId).emit(SOCKET_EVENTS.JOIN_DENIED, { reason: 'kicked' });
    this.io.sockets.sockets.get(player.socketId)?.leave(roomId);

    this.removePlayer(roomId, userId);
    return true;
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
        if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
      } else {
        this.botManager.onBotLeaveRoom(p.id);
      }
      const bankroll = this.bankroll.getUserChips(p.id) ?? 0;
      this.bankroll.persistChips(p.id, bankroll + p.chips);
    });

    this.clearTurnTimer(room);
    if (room.startTimer) clearTimeout(room.startTimer);
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
      peekMode: this.settings.botMode.peekMode,
      rng: this.botManager.makeRngForHand(botId, room.handIndex),
    };
  }

  // Применить решение бота — идёт через тот же handlePlayerAction (внутренние invariants сохранены)
  applyBotAction(roomId: string, botId: string, decision: BotDecision): void {
    this.handlePlayerAction(roomId, botId, decision.action, decision.amount);
  }
}
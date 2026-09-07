// BotManager: оркестрация ботов — создание автостолов, ротация, lifecycle.
// Хранилище (bots.json, runtimes) → BotRepository. Планирование решений → BotDecisionScheduler.
import { randomInt } from 'crypto';
import { nanoid } from 'nanoid';
import { isBot as isBotId } from './botIdentity.js';
import { makeSeededRng, hashStr, type BotDecisionContext, type BotDecision, type BotPersona } from './botBrain.js';
import { BotRepository, FILLER_BOT_ID_PREFIX, type BotInfo } from './botRepository.js';
import { weakenPersona } from './tournamentFillerPersonas.js';
import { BotDecisionScheduler } from './botDecisionScheduler.js';

// Re-export для обратной совместимости (GameManager и admin-роуты импортируют отсюда).
export type { BotInfo, BotPnLTarget } from './botRepository.js';

// Тестовые боты турнира (createTestBots) — id с этим префиксом ИСКЛЮЧЕНЫ из pickBotsForTable
// (иначе их подобрал бы обычный auto-fill кэш-столов, пока они сидят в турнире).
const TEST_BOT_ID_PREFIX = 'bot:tt-';

// Loose-passive профиль (как Fish в defaultBotPersonas) + targetPnL='minus' — играет много слабых
// рук, редко блефует, редко делает hero fold → вместе с риск-шифтом 'minus' стек сливается стабильно.
const TEST_BLEED_PERSONA: BotPersona = {
  aggression: 0.30, bluffRate: 0.03, heroFoldRate: 0.05, slowplayRate: 0.15, vpip: 0.55,
  reactionFast: [900, 2000], reactionSlow: [3200, 5800], fastBias: 0.6,
};

export interface BotModeSettings {
  enabled: boolean;
  peekMode: 'river' | 'turn' | 'full';
  tablesPerLevel: number;
  botsPerTable: number;
  defaultBuyInBb: number;
  refillIntervalMs: number;
}

// Профили автостолов: микро/низкие/средние блайнды.
const AUTO_TABLE_PROFILES = [
  { level: 'micro', name: 'Уютный стол', smallBlind: 1, bigBlind: 2 },
  { level: 'low', name: 'Кэш-комната', smallBlind: 5, bigBlind: 10 },
  { level: 'mid', name: 'Средние блайнды', smallBlind: 25, bigBlind: 50 },
] as const;

type TableLevel = (typeof AUTO_TABLE_PROFILES)[number]['level'];

// Контракт с GameManager — не импортируем класс напрямую, чтобы избежать циклов.
export interface GameManagerForBots {
  hasOpenAutoBotTable(level: TableLevel): boolean;
  createBotTable(opts: {
    level: TableLevel;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
  }): string | null;
  seatBot(roomId: string, bot: import('./botRepository.js').BotInfo, buyIn: number): boolean;
  isRoomActive(roomId: string): boolean;
  forceCloseRoom(roomId: string): boolean;
  buildBotContext(roomId: string, botId: string): BotDecisionContext | null;
  applyBotAction(roomId: string, botId: string, decision: BotDecision): void;
  removeBotFromTable(roomId: string, botId: string): boolean;
}

// Диапазон длины сессии бота за столом: 8–25 минут
const SESSION_MIN_MS = 8 * 60_000;
const SESSION_MAX_MS = 25 * 60_000;

// Задержка перед заменой ушедшего бота: 1–4 минуты
const REPLACE_DELAY_MIN_MS = 60_000;
const REPLACE_DELAY_MAX_MS = 4 * 60_000;

// Минимум ботов за столом (низ диапазона). Верх = settings.botsPerTable.
const BOT_TABLE_MIN = 2;

// Случайное целевое число ботов для стола в диапазоне [BOT_TABLE_MIN .. maxPerTable].
// Вынесено чистой функцией — стол «дышит», число варьируется между столами и во времени.
export function rollBotTableTarget(maxPerTable: number, rnd: () => number = Math.random): number {
  const max = Math.max(BOT_TABLE_MIN, maxPerTable);
  return BOT_TABLE_MIN + Math.floor(rnd() * (max - BOT_TABLE_MIN + 1));
}

export class BotManager {
  private gm: GameManagerForBots;
  private repo: BotRepository;
  private scheduler: BotDecisionScheduler;
  private settings: BotModeSettings;
  private refillTimer: NodeJS.Timeout | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;
  private botTableLevels: Map<string, TableLevel>;
  private botTable: Map<string, string>; // botId → roomId
  private botSessions: Map<string, number>; // botId → sessionEndMs
  private frozenSlots: Map<string, number>; // roomId → count
  private botTableTargets: Map<string, number>; // roomId → целевое число ботов (дышит, 2..botsPerTable)

  constructor(gm: GameManagerForBots, settings: BotModeSettings) {
    this.gm = gm;
    this.settings = settings;
    this.repo = new BotRepository();
    this.scheduler = new BotDecisionScheduler();
    this.botTableLevels = new Map();
    this.botTable = new Map();
    this.botSessions = new Map();
    this.frozenSlots = new Map();
    this.botTableTargets = new Map();
  }

  // Целевое число ботов стола; если ещё не задано — раскидываем и запоминаем.
  private getTableTarget(roomId: string): number {
    let t = this.botTableTargets.get(roomId);
    if (t === undefined) {
      t = rollBotTableTarget(this.settings.botsPerTable);
      this.botTableTargets.set(roomId, t);
    }
    return t;
  }

  // ===== Public API =====

  isBot(playerId: string): boolean { return isBotId(playerId); }

  getBot(botId: string) { return this.repo.get(botId); }
  getBotRuntime(botId: string) { return this.repo.getRuntime(botId); }
  getAllBots() { return this.repo.getAll(); }

  getBotMeta(botId: string) {
    return this.repo.getMeta(botId, this.botTable.get(botId));
  }

  getSettings(): BotModeSettings { return { ...this.settings }; }

  updateSettings(partial: Partial<BotModeSettings>): BotModeSettings {
    const wasEnabled = this.settings.enabled;
    this.settings = { ...this.settings, ...partial };
    if (this.settings.enabled && !wasEnabled) {
      this.enableMode();
    } else if (!this.settings.enabled && wasEnabled) {
      this.disableMode();
    }
    return { ...this.settings };
  }

  updateBotTarget(botId: string, target: import('./botRepository.js').BotPnLTarget): boolean {
    return this.repo.updateTarget(botId, target);
  }

  setBotChips(botId: string, chips: number): boolean {
    const bot = this.repo.get(botId);
    if (!bot) return false;
    this.repo.setChips(botId, chips);
    return true;
  }

  persistBotChips(botId: string, chips: number): void {
    this.repo.persistChips(botId, chips);
  }

  resetAllTotalPnL(): number { return this.repo.resetAllTotalPnL(); }
  refillAllBankrolls(chips: number): number { return this.repo.refillAllBankrolls(chips); }

  // Создаёт N тестовых ботов для турнира (loose-passive + target='minus' — стабильно сливают
  // стек). Не трогает cash-пул: id с префиксом bot:tt- исключён из pickBotsForTable.
  createTestBots(count: number, chips: number): BotInfo[] {
    const now = new Date().toISOString();
    const created: BotInfo[] = [];
    for (let i = 0; i < count; i++) {
      const suffix = nanoid(5);
      const bot: BotInfo = {
        id: `${TEST_BOT_ID_PREFIX}${suffix}`,
        username: `Тестбот-${suffix}`,
        chips,
        targetPnL: 'minus',
        persona: weakenPersona({ ...TEST_BLEED_PERSONA }),
        createdAt: now,
        totalPnL: 0,
      };
      this.repo.add(bot);
      created.push(bot);
    }
    return created;
  }

  // Незаметное заполнение турниров ботами (roadmap 2026-07-09) — фиксированный пул человеческих
  // персон (см. tournamentFillerPersonas.ts), исключён из pickBotsForTable (как и bot:tt-).
  // Список свободен от бронирования TournamentManager'ом (какие id сейчас заняты в других турнирах).
  getFillerPersonaPool(): BotInfo[] {
    return this.repo.getAll().filter((b) => b.id.startsWith(FILLER_BOT_ID_PREFIX));
  }

  // Подготовить персону к посадке в конкретный турнир: выставить стартовый стек турнира и
  // сбросить runtime (PnL/hands с прошлого использования этой персоны — repo.setChips делает это).
  prepareFillerBot(botId: string, chips: number): BotInfo | null {
    const bot = this.repo.get(botId);
    if (!bot || !bot.id.startsWith(FILLER_BOT_ID_PREFIX)) return null;
    this.repo.setChips(botId, chips);
    return bot;
  }

  // ===== Включить / выключить режим =====

  enableMode(): void {
    console.log('🤖 Bot mode ENABLED — ensuring auto-tables');
    this.ensureTables();
    if (this.refillTimer) clearInterval(this.refillTimer);
    this.refillTimer = setInterval(() => this.ensureTables(), this.settings.refillIntervalMs);
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.rotationTimer = setInterval(() => this.rotateExpiredSessions(), 60_000);
  }

  disableMode(): void {
    console.log('🤖 Bot mode DISABLED — closing auto-tables');
    if (this.refillTimer) clearInterval(this.refillTimer);
    this.refillTimer = null;
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.rotationTimer = null;
    // botTableLevels — все авто-столы (регистрируется при СОЗДАНИИ стола); botTable — только уже
    // подсевшие боты (заезжают волнами со сдвигом, могут ещё не подсесть). Закрывать нужно по
    // объединению, иначе свежесозданный стол без подсевших ботов переживает disable (найдено
    // 2026-07-07: только что созданные столы «Уютный стол»/«Кэш-комната»/«Средние блайнды» не
    // закрылись при выключении режима, т.к. боты ещё не подсели — botTable был пуст).
    for (const roomId of new Set([...this.botTableLevels.keys(), ...this.botTable.values()])) {
      this.gm.forceCloseRoom(roomId);
    }
    this.botTable.clear();
    this.botTableLevels.clear();
    this.botSessions.clear();
    this.frozenSlots.clear();
    this.botTableTargets.clear();
    this.scheduler.cancelAll();
  }

  // ===== Оркестрация столов =====

  private ensureTables(): void {
    if (!this.settings.enabled) return;
    for (const profile of AUTO_TABLE_PROFILES) {
      try {
        if (!this.gm.hasOpenAutoBotTable(profile.level)) {
          this.createTableWithBots(profile.level, profile.name, profile.smallBlind, profile.bigBlind);
          continue;
        }
        const existingRoomId = Array.from(this.botTableLevels.entries())
          .find(([, lvl]) => lvl === profile.level)?.[0];
        if (existingRoomId) {
          this.fillExistingTable(existingRoomId, profile.bigBlind);
        }
      } catch (err) {
        // Guard: ошибка на одном уровне не должна тихо гасить весь цикл заполнения навсегда
        // (interval молча падает без этого catch — следующий тик просто не происходит).
        console.error(`🤖 [ensureTables] ошибка на уровне ${profile.level}:`, err);
      }
    }
  }

  private rotateExpiredSessions(): void {
    if (!this.settings.enabled) return;
    const now = Date.now();
    for (const [botId, sessionEnd] of this.botSessions) {
      if (now < sessionEnd) continue;
      const roomId = this.botTable.get(botId);
      if (!roomId || !this.gm.isRoomActive(roomId)) {
        this.botSessions.delete(botId);
        continue;
      }
      const removed = this.gm.removeBotFromTable(roomId, botId);
      if (!removed) continue;
      this.botSessions.delete(botId);
      // Стол «дышит»: при каждом уходе пере-раскидываем целевое число.
      const target = rollBotTableTarget(this.settings.botsPerTable);
      this.botTableTargets.set(roomId, target);
      const currentBots = Array.from(this.botTable.values()).filter((r) => r === roomId).length;
      const frozenNow = this.frozenSlots.get(roomId) ?? 0;
      // Стол на целевом/выше — замены нет, стол сжимается (живой уход).
      if (currentBots + frozenNow >= target) {
        console.log(`🤖 [rotation] ${botId} покинул стол ${roomId}, стол сжимается → ${currentBots}/${target}`);
        continue;
      }
      this.frozenSlots.set(roomId, frozenNow + 1);
      const delayMs = REPLACE_DELAY_MIN_MS + Math.random() * (REPLACE_DELAY_MAX_MS - REPLACE_DELAY_MIN_MS);
      const bigBlind = this.getBigBlindForRoom(roomId);
      console.log(`🤖 [rotation] ${botId} покинул стол ${roomId}, замена через ${Math.round(delayMs / 60000)} мин (target=${target})`);
      setTimeout(() => {
        this.frozenSlots.set(roomId, Math.max(0, (this.frozenSlots.get(roomId) ?? 0) - 1));
        if (this.gm.isRoomActive(roomId)) {
          const cur = Array.from(this.botTable.values()).filter((r) => r === roomId).length;
          if (cur < this.getTableTarget(roomId)) this.seatOneBot(roomId, bigBlind);
        }
      }, delayMs);
    }
  }

  private getBigBlindForRoom(roomId: string): number {
    const level = this.botTableLevels.get(roomId);
    return AUTO_TABLE_PROFILES.find((p) => p.level === level)?.bigBlind ?? 2;
  }

  private seatOneBot(roomId: string, bigBlind: number): void {
    const buyIn = bigBlind * this.settings.defaultBuyInBb;
    this.autoRefillForBuyIn(buyIn, 1);
    const more = this.pickBotsForTable(1, buyIn);
    for (const bot of more) {
      const ok = this.gm.seatBot(roomId, bot, buyIn);
      if (ok) {
        this.botTable.set(bot.id, roomId);
        this.assignSession(bot.id);
        this.repo.initRuntime(bot.id, bot.chips);
        console.log(`🤖 [join] ${bot.username} сел за стол ${roomId}`);
      }
    }
  }

  private fillExistingTable(roomId: string, bigBlind: number): void {
    const currentBots = Array.from(this.botTable.values()).filter((r) => r === roomId).length;
    const frozen = this.frozenSlots.get(roomId) ?? 0;
    const target = this.getTableTarget(roomId);
    const needed = target - currentBots - frozen;
    if (needed <= 0) return;
    const buyIn = bigBlind * this.settings.defaultBuyInBb;
    this.autoRefillForBuyIn(buyIn, needed);
    const more = this.pickBotsForTable(needed, buyIn);
    let added = 0;
    for (const bot of more) {
      const ok = this.gm.seatBot(roomId, bot, buyIn);
      if (ok) {
        this.botTable.set(bot.id, roomId);
        this.assignSession(bot.id);
        this.repo.initRuntime(bot.id, bot.chips);
        added++;
      }
    }
    if (added > 0) {
      console.log(`🤖 [fill] ${roomId} +${added} (теперь ${currentBots + added}/${target})`);
    }
  }

  private createTableWithBots(level: TableLevel, name: string, smallBlind: number, bigBlind: number): void {
    const maxPlayers = Math.max(this.settings.botsPerTable + 3, 6);
    const roomId = this.gm.createBotTable({ level, name, smallBlind, bigBlind, maxPlayers });
    if (!roomId) return;
    this.botTableLevels.set(roomId, level);

    // Целевое число для стола — своё, в диапазоне [2 .. botsPerTable]. Стол наполняется не мгновенно.
    const target = rollBotTableTarget(this.settings.botsPerTable);
    this.botTableTargets.set(roomId, target);

    const buyIn = bigBlind * this.settings.defaultBuyInBb;
    const initialCount = BOT_TABLE_MIN + Math.floor(Math.random() * (target - BOT_TABLE_MIN + 1));

    this.autoRefillForBuyIn(buyIn, initialCount);
    const candidates = this.pickBotsForTable(initialCount, buyIn);
    let seated = 0;
    for (const bot of candidates) {
      const ok = this.gm.seatBot(roomId, bot, buyIn);
      if (ok) {
        this.botTable.set(bot.id, roomId);
        this.assignSession(bot.id);
        this.repo.initRuntime(bot.id, bot.chips);
        seated++;
      }
    }

    const remaining = target - seated;
    let cumulativeMs = 0;
    for (let i = 0; i < remaining; i++) {
      cumulativeMs += REPLACE_DELAY_MIN_MS + Math.random() * (REPLACE_DELAY_MAX_MS - REPLACE_DELAY_MIN_MS);
      const delay = cumulativeMs;
      setTimeout(() => {
        if (!this.gm.isRoomActive(roomId)) return;
        const cur = Array.from(this.botTable.values()).filter((r) => r === roomId).length;
        if (cur >= this.getTableTarget(roomId)) return;
        this.seatOneBot(roomId, bigBlind);
      }, delay);
    }

    console.log(`🤖 Создан стол: ${name} (${smallBlind}/${bigBlind}), target=${target}, сразу=${seated}, придут позже=${remaining}`);
  }

  private assignSession(botId: string): void {
    const sessionMs = SESSION_MIN_MS + Math.random() * (SESSION_MAX_MS - SESSION_MIN_MS);
    this.botSessions.set(botId, Date.now() + sessionMs);
  }

  private pickBotsForTable(n: number, buyIn: number): import('./botRepository.js').BotInfo[] {
    const free = this.repo.getAll().filter((b) => !this.botTable.has(b.id) && b.chips >= buyIn && !b.id.startsWith(TEST_BOT_ID_PREFIX) && !b.id.startsWith(FILLER_BOT_ID_PREFIX));
    const minus = free.filter((b) => b.targetPnL === 'minus');
    const others = free.filter((b) => b.targetPnL !== 'minus');
    this.shuffleArray(minus);
    this.shuffleArray(others);
    const chosen: import('./botRepository.js').BotInfo[] = [];
    if (minus.length > 0) chosen.push(minus[0]);
    for (const b of others) {
      if (chosen.length >= n) break;
      chosen.push(b);
    }
    for (const b of minus.slice(1)) {
      if (chosen.length >= n) break;
      chosen.push(b);
    }
    return chosen.slice(0, n);
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private autoRefillForBuyIn(buyIn: number, needed: number): void {
    // Тот же фильтр префиксов, что и в pickBotsForTable — иначе тут "eligible" считает
    // богатых bot:fill-/bot:tt- (не годны для кэш-стола), рефилл кажется не нужен, а реальный
    // кэш-пул (50 обычных персон) навсегда остаётся без чипов (найдено 2026-08-11: боты не
    // подсаживались, chips у кэш-пула стабильно у нуля несмотря на "работающий" auto-refill).
    const free = this.repo.getAll().filter(
      (b) => !this.botTable.has(b.id) && !b.id.startsWith(TEST_BOT_ID_PREFIX) && !b.id.startsWith(FILLER_BOT_ID_PREFIX),
    );
    const eligible = free.filter((b) => b.chips >= buyIn);
    if (eligible.length >= needed) return;
    const refillTarget = buyIn * 2;
    let refilled = 0;
    for (const bot of free) {
      if (bot.chips >= buyIn) continue;
      this.repo.setChips(bot.id, refillTarget);
      refilled++;
    }
    if (refilled > 0) {
      console.log(`🤖 [auto-refill] ${refilled} бот(а) → ${refillTarget} chips (buyIn=${buyIn})`);
    }
  }

  // ===== Принятие решения =====

  scheduleBotDecision(roomId: string, botId: string): void {
    this.scheduler.schedule(roomId, botId, this.repo, this.gm);
  }

  cancelBotDecision(botId: string): void {
    this.scheduler.cancel(botId);
  }

  // ===== Hand lifecycle =====

  onHandEnd(botId: string, finalChips: number, bigBlind: number): void {
    this.repo.onHandEnd(botId, finalChips, bigBlind);
  }

  onBotLeaveRoom(botId: string): void {
    this.botTable.delete(botId);
    this.botSessions.delete(botId);
    this.scheduler.cancel(botId);
  }

  onTableClosed(roomId: string): void {
    this.botTableLevels.delete(roomId);
    this.frozenSlots.delete(roomId);
    this.botTableTargets.delete(roomId);
    for (const [botId, rid] of this.botTable) {
      if (rid === roomId) this.botTable.delete(botId);
    }
  }

  // Секрет процесса: без него seed складывался только из публичных величин — botId уходит клиенту
  // в каждом GAME_UPDATE, handIndex досчитывается наблюдением за столом, а mulberry32 — открытый
  // алгоритм. То есть решения бота можно было предсказать (security review 2026-08-24). Соль живёт
  // только в памяти сервера и меняется на каждом рестарте.
  private readonly rngSalt = randomInt(0, 2 ** 31);

  makeRngForHand(botId: string, handIndex: number): () => number {
    return makeSeededRng((hashStr(botId) ^ handIndex ^ this.rngSalt) >>> 0);
  }
}

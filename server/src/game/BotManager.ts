// BotManager: оркестрация ботов — загрузка из bots.json, создание автостолов,
// планирование решений ботов, persist chips после раздачи, periodic refill.
// Работает в связке с GameManager (вызывает его методы для seat/leave/action).

import { readJSON, writeJSON } from '../auth/storage.js';
import { isBot as isBotId } from './botIdentity.js';
import { DEFAULT_BOT_PERSONAS } from './defaultBotPersonas.js';
import {
  decideAction,
  createBotRuntime,
  recordHandResult,
  makeSeededRng,
  hashStr,
  type BotPersona,
  type BotRuntime,
  type BotDecisionContext,
  type BotDecision,
} from './botBrain.js';

type BotPnLTarget = 'zero' | 'plus' | 'minus';
type BotPeekMode = 'river' | 'turn' | 'full';

export interface BotInfo {
  id: string;
  username: string;
  chips: number;
  targetPnL: BotPnLTarget;
  persona: BotPersona;
  createdAt: string;
}

export interface BotModeSettings {
  enabled: boolean;
  peekMode: BotPeekMode;
  tablesPerLevel: number;
  botsPerTable: number;
  defaultBuyInBb: number;
  refillIntervalMs: number;
}

// Профили автостолов: микро/низкие/средние блайнды.
// Каждый уровень → отдельный стол.
const AUTO_TABLE_PROFILES = [
  { level: 'micro', name: 'Уютный стол', smallBlind: 1, bigBlind: 2 },
  { level: 'low', name: 'Кэш-комната', smallBlind: 5, bigBlind: 10 },
  { level: 'mid', name: 'Средние блайнды', smallBlind: 25, bigBlind: 50 },
] as const;

type TableLevel = (typeof AUTO_TABLE_PROFILES)[number]['level'];

// Контракт с GameManager — не импортируем класс напрямую, чтобы избежать циклов.
// Передаётся в конструктор через интерфейс.
export interface GameManagerForBots {
  hasOpenAutoBotTable(level: TableLevel): boolean;
  createBotTable(opts: {
    level: TableLevel;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
  }): string | null;
  seatBot(roomId: string, bot: BotInfo, buyIn: number): boolean;
  isRoomActive(roomId: string): boolean;
  forceCloseRoom(roomId: string): boolean;
  // Вызывается из emitCurrentTurn когда ход бота. botBrain принимает решение, отвечает actions.
  buildBotContext(roomId: string, botId: string): BotDecisionContext | null;
  applyBotAction(roomId: string, botId: string, decision: BotDecision): void;
}

export class BotManager {
  private gm: GameManagerForBots;
  private bots: Map<string, BotInfo>;
  private runtimes: Map<string, BotRuntime>;
  private settings: BotModeSettings;
  private pendingDecisions: Map<string, NodeJS.Timeout>; // botId → timer
  private refillTimer: NodeJS.Timeout | null = null;
  // Привязка стола к уровню — для refill и логирования.
  private botTableLevels: Map<string, TableLevel>;
  // Какие боты на каком столе — для контроля переподсадки.
  private botTable: Map<string, string>; // botId → roomId

  constructor(gm: GameManagerForBots, settings: BotModeSettings) {
    this.gm = gm;
    this.settings = settings;
    this.bots = new Map();
    this.runtimes = new Map();
    this.pendingDecisions = new Map();
    this.botTableLevels = new Map();
    this.botTable = new Map();
    this.loadBots();
  }

  // ===== Загрузка/persist =====

  private loadBots(): void {
    try {
      const data = readJSON('bots.json') as BotInfo[];
      if (!Array.isArray(data)) throw new Error('not-array');
      data.forEach((b) => {
        this.bots.set(b.id, b);
        this.runtimes.set(b.id, createBotRuntime(b.chips));
      });
      console.log(`🤖 Loaded ${this.bots.size} bot personas`);
    } catch {
      console.log('🤖 No bots.json found / corrupted — seeding default pool');
    }
    // Если по любой причине пул пуст (нет файла / битый JSON / пустой массив) — пересеять.
    if (this.bots.size === 0) {
      this.seedDefaultPool();
      this.saveBots();
    }
  }

  // Дефолтный пул из 12 ботов — seed-данные в defaultBotPersonas.ts (ROADMAP §9.3-D).
  // Срабатывает только при пустом пуле — не перезаписывает существующих.
  private seedDefaultPool(): void {
    const now = new Date().toISOString();
    for (const d of DEFAULT_BOT_PERSONAS) {
      const id = 'bot:' + d.name.toLowerCase();
      const bot: BotInfo = {
        id,
        username: d.name,
        chips: d.chips,
        targetPnL: d.target,
        persona: d.persona,
        createdAt: now,
      };
      this.bots.set(id, bot);
      this.runtimes.set(id, createBotRuntime(bot.chips));
    }
    console.log(`🤖 Seeded ${this.bots.size} default bot personas`);
  }

  private saveBots(): void {
    try {
      writeJSON('bots.json', Array.from(this.bots.values()));
    } catch {}
  }

  // Persist chips одного бота
  persistBotChips(botId: string, chips: number): void {
    const bot = this.bots.get(botId);
    if (!bot || bot.chips === chips) return;
    bot.chips = chips;
    this.saveBots();
  }

  // ===== Public API =====

  isBot(playerId: string): boolean {
    return isBotId(playerId);
  }

  getBot(botId: string): BotInfo | undefined {
    return this.bots.get(botId);
  }

  getBotRuntime(botId: string): BotRuntime | undefined {
    return this.runtimes.get(botId);
  }

  getAllBots(): BotInfo[] {
    return Array.from(this.bots.values());
  }

  getBotMeta(botId: string): { bot: BotInfo; runtime: BotRuntime; roomId?: string } | null {
    const bot = this.bots.get(botId);
    const runtime = this.runtimes.get(botId);
    if (!bot || !runtime) return null;
    return { bot, runtime, roomId: this.botTable.get(botId) };
  }

  getSettings(): BotModeSettings {
    return { ...this.settings };
  }

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

  // Обновить target одного бота (admin endpoint)
  updateBotTarget(botId: string, target: BotPnLTarget): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;
    bot.targetPnL = target;
    this.saveBots();
    return true;
  }

  // Установить chips одному боту (admin endpoint). Сбрасывает runtime.PnL.
  setBotChips(botId: string, chips: number): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;
    bot.chips = chips;
    const rt = this.runtimes.get(botId);
    if (rt) {
      rt.realizedPnL = 0;
      rt.handsPlayed = 0;
      rt.handStartChips = chips;
    }
    this.saveBots();
    return true;
  }

  // Массовое пополнение банкроллов всех ботов до указанной суммы.
  // Сбрасывает runtime.PnL — это «новый старт».
  refillAllBankrolls(chips: number): number {
    let updated = 0;
    for (const bot of this.bots.values()) {
      if (bot.chips !== chips) {
        bot.chips = chips;
        updated++;
      }
      const rt = this.runtimes.get(bot.id);
      if (rt) {
        rt.realizedPnL = 0;
        rt.handsPlayed = 0;
        rt.handStartChips = chips;
      }
    }
    this.saveBots();
    console.log(`🤖 Refilled ${updated} bots to ${chips} chips each, PnL reset`);
    return updated;
  }

  // ===== Включить / выключить режим =====

  enableMode(): void {
    console.log('🤖 Bot mode ENABLED — ensuring 3 auto-tables');
    this.ensureTables();
    if (this.refillTimer) clearInterval(this.refillTimer);
    this.refillTimer = setInterval(() => this.ensureTables(), this.settings.refillIntervalMs);
  }

  disableMode(): void {
    console.log('🤖 Bot mode DISABLED — closing auto-tables');
    if (this.refillTimer) clearInterval(this.refillTimer);
    this.refillTimer = null;
    // Закрыть все авто-столы; стеки ботов возвращаются в bots.json через persistBotChips
    for (const roomId of new Set(this.botTable.values())) {
      this.gm.forceCloseRoom(roomId);
    }
    this.botTable.clear();
    this.botTableLevels.clear();
    // Отменить все pending decisions
    for (const t of this.pendingDecisions.values()) clearTimeout(t);
    this.pendingDecisions.clear();
  }

  // Проверить, что для каждого уровня есть стол с ботами; если нет — создать.
  // Если стол есть, но ботов меньше нужного — доращиваем (fill).
  // Раньше hasOpenAutoBotTable пропускал любой существующий стол, поэтому стол с 1 ботом
  // оставался полупустым 2+ минут. Особенно болезненно для «Средних» (BB=50), где боты
  // часто разоряются и стол постепенно опустевал (см. CLAUDE.md §11.30 шероховатости).
  private ensureTables(): void {
    if (!this.settings.enabled) return;
    for (const profile of AUTO_TABLE_PROFILES) {
      if (!this.gm.hasOpenAutoBotTable(profile.level)) {
        this.createTableWithBots(profile.level, profile.name, profile.smallBlind, profile.bigBlind);
        continue;
      }
      // Стол этого уровня уже есть — найти его roomId и доращивать если ботов меньше нужного
      const existingRoomId = Array.from(this.botTableLevels.entries())
        .find(([, lvl]) => lvl === profile.level)?.[0];
      if (existingRoomId) {
        this.fillExistingTable(existingRoomId, profile.bigBlind);
      }
    }
  }

  // Дополнить существующий бот-стол до botsPerTable, если ботов меньше нужного.
  // Реальные игроки могут сидеть рядом — мы добавляем только до целевого count ботов,
  // не игроков. Auto-refill банкроллов вызывается перед pickBotsForTable.
  private fillExistingTable(roomId: string, bigBlind: number): void {
    const currentBots = Array.from(this.botTable.entries()).filter(([, rid]) => rid === roomId).length;
    const needed = this.settings.botsPerTable - currentBots;
    if (needed <= 0) return;
    const buyIn = bigBlind * this.settings.defaultBuyInBb;
    this.autoRefillForBuyIn(buyIn, needed);
    const more = this.pickBotsForTable(needed, buyIn);
    let added = 0;
    for (const bot of more) {
      const ok = this.gm.seatBot(roomId, bot, buyIn);
      if (ok) {
        this.botTable.set(bot.id, roomId);
        const rt = this.runtimes.get(bot.id);
        if (rt) rt.handStartChips = bot.chips;
        added++;
      }
    }
    if (added > 0) {
      console.log(`🤖 [fill-table] roomId=${roomId} +${added} bot(s) (now ${currentBots + added}/${this.settings.botsPerTable})`);
    }
  }

  private createTableWithBots(
    level: TableLevel,
    name: string,
    smallBlind: number,
    bigBlind: number,
  ): void {
    const maxPlayers = Math.max(this.settings.botsPerTable + 3, 6);
    const roomId = this.gm.createBotTable({ level, name, smallBlind, bigBlind, maxPlayers });
    if (!roomId) return;
    this.botTableLevels.set(roomId, level);
    // Выбрать N свободных ботов с достаточным банкроллом
    const buyIn = bigBlind * this.settings.defaultBuyInBb;
    // Auto-refill: если кандидатов для buy-in недостаточно, рефиллим всех свободных ботов
    // с низким балансом до 2*buyIn (запас на пару раздач). Это self-healing — без него
    // бот-столы постепенно пустеют по мере разорения ботов.
    this.autoRefillForBuyIn(buyIn, this.settings.botsPerTable);
    const candidates = this.pickBotsForTable(this.settings.botsPerTable, buyIn);
    let seated = 0;
    for (const bot of candidates) {
      const ok = this.gm.seatBot(roomId, bot, buyIn);
      if (ok) {
        this.botTable.set(bot.id, roomId);
        const rt = this.runtimes.get(bot.id);
        if (rt) rt.handStartChips = bot.chips;
        seated++;
      }
    }
    console.log(`🤖 Auto-table created: ${name} (${smallBlind}/${bigBlind}), seated ${seated} bots`);
  }

  // Выбрать N свободных ботов с банкроллом >= buyIn
  private pickBotsForTable(n: number, buyIn: number): BotInfo[] {
    const free = Array.from(this.bots.values()).filter(
      (b) => !this.botTable.has(b.id) && b.chips >= buyIn,
    );
    // Гарантируем разнообразие target: если есть minus-бот — посадим хотя бы 1.
    // Иначе игроки никогда не выиграют у бот-столов.
    const minus = free.filter((b) => b.targetPnL === 'minus');
    const others = free.filter((b) => b.targetPnL !== 'minus');
    const chosen: BotInfo[] = [];
    if (minus.length > 0) chosen.push(minus[0]);
    for (const b of others) {
      if (chosen.length >= n) break;
      chosen.push(b);
    }
    // Если minus был и осталось место — добавить ещё
    for (const b of minus.slice(1)) {
      if (chosen.length >= n) break;
      chosen.push(b);
    }
    return chosen.slice(0, n);
  }

  // Self-healing: если для текущего buyIn недостаточно ботов с chips ≥ buyIn,
  // пополняем банкролл всем свободным (не на других столах) с низким балансом до 2*buyIn.
  // Сбрасывает runtime.PnL — это «новый старт» для подкаченного бота.
  // Без этого бот-столы постепенно пустеют по мере разорения ботов.
  private autoRefillForBuyIn(buyIn: number, needed: number): void {
    const free = Array.from(this.bots.values()).filter((b) => !this.botTable.has(b.id));
    const eligible = free.filter((b) => b.chips >= buyIn);
    if (eligible.length >= needed) return;
    const refillTarget = buyIn * 2;
    let refilled = 0;
    for (const bot of free) {
      if (bot.chips >= buyIn) continue; // уже подходит
      bot.chips = refillTarget;
      const rt = this.runtimes.get(bot.id);
      if (rt) {
        rt.realizedPnL = 0;
        rt.handsPlayed = 0;
        rt.handStartChips = refillTarget;
      }
      refilled++;
    }
    if (refilled > 0) {
      this.saveBots();
      console.log(`🤖 [auto-refill] ${refilled} bot(s) → ${refillTarget} chips each (для buyIn=${buyIn})`);
    }
  }

  // ===== Принятие решения =====

  scheduleBotDecision(roomId: string, botId: string): void {
    const bot = this.bots.get(botId);
    const runtime = this.runtimes.get(botId);
    if (!bot || !runtime) return;
    // Отменяем старый тимер если был
    const old = this.pendingDecisions.get(botId);
    if (old) clearTimeout(old);
    // Считаем delay через persona, делаем initial decision для расчёта delay
    const ctx = this.gm.buildBotContext(roomId, botId);
    if (!ctx) return;
    let decision: BotDecision;
    try {
      decision = decideAction(ctx);
    } catch (e) {
      console.error('🤖 Bot decide error:', e);
      decision = { action: 'fold', delayMs: 1500, tag: 'error-fold' };
    }
    // Запись bluff-событий в runtime: decideAction теперь чистая, мутацию делаем здесь (§9.3-D).
    if (decision.recordBluff) runtime.bluffEventHands.push(runtime.handsPlayed);
    if (decision.recordBluffCall) runtime.bluffCallEventHands.push(runtime.handsPlayed);
    const timer = setTimeout(() => {
      this.pendingDecisions.delete(botId);
      // Лог особых tag'ов (peek/bluff/all-in/slowplay) — для аналитики PnL-driven веток.
      // Нормальные normal-fold/check/call не логируем (шум).
      if (decision.tag && (
        decision.tag.startsWith('peek-') ||
        decision.tag.includes('bluff') ||
        decision.tag.includes('all-in') ||
        decision.tag.includes('slowplay') ||
        decision.tag.includes('hero-fold') ||
        decision.tag.includes('mistake')
      )) {
        const bot = this.bots.get(botId);
        console.log(`🎯 [${bot?.username ?? botId}] ${decision.action} tag=${decision.tag}`);
      }
      // Пересчитываем решение в момент тика — state мог измениться (другой игрок ушёл / рейзнул).
      // Используем уже посчитанное decision — упрощение, race-condition в GameManager отрежется
      // через playerIds[currentPlayerIndex] !== botId.
      this.gm.applyBotAction(roomId, botId, decision);
    }, decision.delayMs);
    this.pendingDecisions.set(botId, timer);
  }

  // Отменить pending decision (например, при removePlayer/handleDisconnect)
  cancelBotDecision(botId: string): void {
    const t = this.pendingDecisions.get(botId);
    if (t) {
      clearTimeout(t);
      this.pendingDecisions.delete(botId);
    }
  }

  // ===== Hand lifecycle =====

  // Вызывается из GameManager.cleanupHand — фиксируем PnL бота
  onHandEnd(botId: string, finalChips: number, bigBlind: number): void {
    const bot = this.bots.get(botId);
    const runtime = this.runtimes.get(botId);
    if (!bot || !runtime) return;
    recordHandResult(runtime, finalChips, bigBlind);
    // Persist обновлённые chips
    this.persistBotChips(botId, finalChips);
  }

  // Удалить бота из привязки к столу (например, разорился и autoLeaveBrokePlayers выбросил)
  onBotLeaveRoom(botId: string): void {
    this.botTable.delete(botId);
    this.cancelBotDecision(botId);
  }

  // Удалить связь стол-уровень (когда стол закрылся)
  onTableClosed(roomId: string): void {
    this.botTableLevels.delete(roomId);
    // Очистить ботов, привязанных к этому столу
    for (const [botId, rid] of this.botTable) {
      if (rid === roomId) this.botTable.delete(botId);
    }
  }

  // Создать seeded RNG для (botId + handIndex) — детерминируемо
  makeRngForHand(botId: string, handIndex: number): () => number {
    return makeSeededRng(hashStr(botId) ^ handIndex);
  }
}

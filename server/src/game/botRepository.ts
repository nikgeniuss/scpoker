// Хранилище ботов: загрузка/запись bots.json, CRUD по BotInfo/BotRuntime.
// Без зависимостей на GameManager / io. BotManager делегирует сюда всё storage.
import { readJSON, writeJSON } from '../auth/storage.js';
import { DEFAULT_BOT_PERSONAS } from './defaultBotPersonas.js';
import { createBotRuntime, recordHandResult, type BotPersona, type BotRuntime } from './botBrain.js';

export type BotPnLTarget = 'zero' | 'plus' | 'minus';

export interface BotInfo {
  id: string;
  username: string;
  chips: number;
  targetPnL: BotPnLTarget;
  persona: BotPersona;
  createdAt: string;
  totalPnL: number;
}

export class BotRepository {
  private bots: Map<string, BotInfo>;
  private runtimes: Map<string, BotRuntime>;

  constructor() {
    this.bots = new Map();
    this.runtimes = new Map();
    this.loadBots();
  }

  // ─── Internal: load/seed/merge/sync ─────────────────────────────────────────

  private loadBots(): void {
    try {
      const data = readJSON('bots.json') as BotInfo[];
      if (!Array.isArray(data)) throw new Error('not-array');
      data.forEach((b) => {
        b.totalPnL = b.totalPnL ?? 0;
        this.bots.set(b.id, b);
        this.runtimes.set(b.id, createBotRuntime(b.chips));
      });
      console.log(`🤖 Loaded ${this.bots.size} bot personas`);
    } catch {
      console.log('🤖 No bots.json found / corrupted — seeding default pool');
    }
    if (this.bots.size === 0) {
      this.seedDefaultPool();
      this.save();
    } else {
      let dirty = false;
      if (this.bots.size < DEFAULT_BOT_PERSONAS.length) {
        dirty = this.mergeNewPersonas();
      }
      dirty = this.syncTargetsFromDefaults() || dirty;
      if (dirty) this.save();
    }
  }

  private seedDefaultPool(): void {
    const now = new Date().toISOString();
    for (const d of DEFAULT_BOT_PERSONAS) {
      const id = 'bot:' + d.name.toLowerCase();
      const bot: BotInfo = { id, username: d.name, chips: d.chips, targetPnL: d.target, persona: d.persona, createdAt: now, totalPnL: 0 };
      this.bots.set(id, bot);
      this.runtimes.set(id, createBotRuntime(bot.chips));
    }
    console.log(`🤖 Seeded ${this.bots.size} default bot personas`);
  }

  private mergeNewPersonas(): boolean {
    const now = new Date().toISOString();
    let added = 0;
    for (const d of DEFAULT_BOT_PERSONAS) {
      const id = 'bot:' + d.name.toLowerCase();
      if (this.bots.has(id)) continue;
      const bot: BotInfo = { id, username: d.name, chips: d.chips, targetPnL: d.target, persona: d.persona, createdAt: now, totalPnL: 0 };
      this.bots.set(id, bot);
      this.runtimes.set(id, createBotRuntime(bot.chips));
      added++;
    }
    if (added > 0) console.log(`🤖 Merged ${added} new personas → pool now ${this.bots.size}`);
    return added > 0;
  }

  private syncTargetsFromDefaults(): boolean {
    let changed = 0;
    for (const d of DEFAULT_BOT_PERSONAS) {
      const id = 'bot:' + d.name.toLowerCase();
      const bot = this.bots.get(id);
      if (bot && bot.targetPnL !== d.target) { bot.targetPnL = d.target; changed++; }
    }
    if (changed > 0) console.log(`🤖 Synced targetPnL for ${changed} bots from defaults`);
    return changed > 0;
  }

  private save(): void {
    try { writeJSON('bots.json', Array.from(this.bots.values())); } catch {
      // best-effort — следующий save перезапишет
    }
  }

  // ─── Public read ─────────────────────────────────────────────────────────────

  get(botId: string): BotInfo | undefined { return this.bots.get(botId); }
  getRuntime(botId: string): BotRuntime | undefined { return this.runtimes.get(botId); }
  getAll(): BotInfo[] { return Array.from(this.bots.values()); }
  has(botId: string): boolean { return this.bots.has(botId); }

  getMeta(botId: string, roomId?: string): { bot: BotInfo; runtime: BotRuntime; roomId?: string } | null {
    const bot = this.bots.get(botId);
    const runtime = this.runtimes.get(botId);
    if (!bot || !runtime) return null;
    return { bot, runtime, roomId };
  }

  // ─── Public write ────────────────────────────────────────────────────────────

  persistChips(botId: string, chips: number): void {
    const bot = this.bots.get(botId);
    if (!bot || bot.chips === chips) return;
    bot.chips = chips;
    this.save();
  }

  setChips(botId: string, chips: number): void {
    const bot = this.bots.get(botId);
    if (!bot) return;
    bot.chips = chips;
    const rt = this.runtimes.get(botId);
    if (rt) { rt.realizedPnL = 0; rt.handsPlayed = 0; rt.handStartChips = chips; }
    this.save();
  }

  // Добавляет новую персону "на лету" (не из DEFAULT_BOT_PERSONAS) — например тестовые боты турнира.
  add(bot: BotInfo): void {
    this.bots.set(bot.id, bot);
    this.runtimes.set(bot.id, createBotRuntime(bot.chips));
    this.save();
  }

  updateTarget(botId: string, target: BotPnLTarget): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;
    bot.targetPnL = target;
    this.save();
    return true;
  }

  resetAllTotalPnL(): number {
    let count = 0;
    for (const bot of this.bots.values()) {
      if (bot.totalPnL !== 0) { bot.totalPnL = 0; count++; }
    }
    this.save();
    return count;
  }

  refillAllBankrolls(chips: number): number {
    let updated = 0;
    for (const bot of this.bots.values()) {
      if (bot.chips !== chips) { bot.chips = chips; updated++; }
      const rt = this.runtimes.get(bot.id);
      if (rt) { rt.realizedPnL = 0; rt.handsPlayed = 0; rt.handStartChips = chips; }
    }
    this.save();
    console.log(`🤖 Refilled ${updated} bots to ${chips} chips each, PnL reset`);
    return updated;
  }

  onHandEnd(botId: string, finalChips: number, bigBlind: number): void {
    const bot = this.bots.get(botId);
    const runtime = this.runtimes.get(botId);
    if (!bot || !runtime) return;
    bot.totalPnL += finalChips - runtime.handStartChips;
    recordHandResult(runtime, finalChips, bigBlind);
    this.persistChips(botId, finalChips);
  }

  initRuntime(botId: string, chips: number): void {
    if (!this.runtimes.has(botId)) {
      this.runtimes.set(botId, createBotRuntime(chips));
    }
    const rt = this.runtimes.get(botId)!;
    rt.handStartChips = chips;
  }
}

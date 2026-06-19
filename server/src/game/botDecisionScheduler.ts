// Планировщик решений ботов: вычисляет решение через botBrain и запускает с задержкой.
// Не знает о io/Room — только botBrain + контракт с GameManager.
import { decideAction, type BotDecisionContext, type BotDecision } from './botBrain.js';
import type { BotRepository } from './botRepository.js';

// Минимальный контракт с GameManager (чтобы не импортировать целый класс).
interface GmForScheduler {
  buildBotContext(roomId: string, botId: string): BotDecisionContext | null;
  applyBotAction(roomId: string, botId: string, decision: BotDecision): void;
}

export class BotDecisionScheduler {
  private pending: Map<string, NodeJS.Timeout> = new Map();

  schedule(roomId: string, botId: string, repo: BotRepository, gm: GmForScheduler): void {
    const bot = repo.get(botId);
    const runtime = repo.getRuntime(botId);
    if (!bot || !runtime) return;

    this.cancel(botId);

    const ctx = gm.buildBotContext(roomId, botId);
    if (!ctx) return;

    let decision: BotDecision;
    try {
      decision = decideAction(ctx);
    } catch (e) {
      console.error('🤖 Bot decide error:', e);
      decision = { action: 'fold', delayMs: 1500, tag: 'error-fold' };
    }

    if (decision.recordBluff) runtime.bluffEventHands.push(runtime.handsPlayed);
    if (decision.recordBluffCall) runtime.bluffCallEventHands.push(runtime.handsPlayed);

    const timer = setTimeout(() => {
      this.pending.delete(botId);
      if (decision.tag && (
        decision.tag.startsWith('peek-') ||
        decision.tag.includes('bluff') ||
        decision.tag.includes('all-in') ||
        decision.tag.includes('slowplay') ||
        decision.tag.includes('hero-fold') ||
        decision.tag.includes('mistake')
      )) {
        console.log(`🎯 [${bot.username}] ${decision.action} tag=${decision.tag}`);
      }
      gm.applyBotAction(roomId, botId, decision);
    }, decision.delayMs);

    this.pending.set(botId, timer);
  }

  cancel(botId: string): void {
    const t = this.pending.get(botId);
    if (t) { clearTimeout(t); this.pending.delete(botId); }
  }

  cancelAll(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}

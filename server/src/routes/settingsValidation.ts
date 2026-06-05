// Валидация PUT /api/admin/settings — вынесена из роута (ROADMAP §9.3-C).
// Возвращает { patch } для GameManager.updateSettings либо { error } (→ 400).
// Логика и сообщения 1:1 с прежним инлайном.

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v);
const isNonNegInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);

export function validateSettingsPatch(
  body: Record<string, unknown>,
): { patch: Record<string, unknown> } | { error: string } {
  const { turnDurationMs, autostartDelayMs, defaultPlayerChips, timebank, botMode } = body;
  const patch: Record<string, unknown> = {};

  if (turnDurationMs !== undefined) {
    if (!isPositiveInt(turnDurationMs) || turnDurationMs < 5000 || turnDurationMs > 300000) {
      return { error: 'turnDurationMs: 5000–300000 (мс)' };
    }
    patch.turnDurationMs = turnDurationMs;
  }
  if (autostartDelayMs !== undefined) {
    if (!isPositiveInt(autostartDelayMs) || autostartDelayMs < 0 || autostartDelayMs > 120000) {
      return { error: 'autostartDelayMs: 0–120000 (мс)' };
    }
    patch.autostartDelayMs = autostartDelayMs;
  }
  if (defaultPlayerChips !== undefined) {
    if (!isPositiveInt(defaultPlayerChips) || defaultPlayerChips < 1 || defaultPlayerChips > 1000000) {
      return { error: 'defaultPlayerChips: 1–1000000' };
    }
    patch.defaultPlayerChips = defaultPlayerChips;
  }
  if (timebank !== undefined) {
    if (!timebank || typeof timebank !== 'object') {
      return { error: 'timebank: object' };
    }
    const t = timebank as Record<string, unknown>;
    const tbPatch: Record<string, unknown> = {};
    if (t.enabled !== undefined) {
      if (typeof t.enabled !== 'boolean') {
        return { error: 'timebank.enabled: boolean' };
      }
      tbPatch.enabled = t.enabled;
    }
    if (t.allowPerTableOverride !== undefined) {
      if (typeof t.allowPerTableOverride !== 'boolean') {
        return { error: 'timebank.allowPerTableOverride: boolean' };
      }
      tbPatch.allowPerTableOverride = t.allowPerTableOverride;
    }
    if (t.startSec !== undefined) {
      if (!isNonNegInt(t.startSec) || t.startSec > 600) {
        return { error: 'timebank.startSec: 0..600' };
      }
      tbPatch.startSec = t.startSec;
    }
    if (t.bonusSec !== undefined) {
      if (!isNonNegInt(t.bonusSec) || t.bonusSec > 600) {
        return { error: 'timebank.bonusSec: 0..600' };
      }
      tbPatch.bonusSec = t.bonusSec;
    }
    if (t.bonusEveryHands !== undefined) {
      if (!isPositiveInt(t.bonusEveryHands) || t.bonusEveryHands > 1000) {
        return { error: 'timebank.bonusEveryHands: 1..1000' };
      }
      tbPatch.bonusEveryHands = t.bonusEveryHands;
    }
    if (t.capSec !== undefined) {
      if (!isNonNegInt(t.capSec) || t.capSec > 600) {
        return { error: 'timebank.capSec: 0..600' };
      }
      tbPatch.capSec = t.capSec;
    }
    patch.timebank = tbPatch;
  }
  if (botMode !== undefined) {
    if (!botMode || typeof botMode !== 'object') {
      return { error: 'botMode: object' };
    }
    const b = botMode as Record<string, unknown>;
    const bmPatch: Record<string, unknown> = {};
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') {
        return { error: 'botMode.enabled: boolean' };
      }
      bmPatch.enabled = b.enabled;
    }
    if (b.peekMode !== undefined) {
      if (b.peekMode !== 'river' && b.peekMode !== 'turn' && b.peekMode !== 'full') {
        return { error: 'botMode.peekMode: "river" | "turn" | "full"' };
      }
      bmPatch.peekMode = b.peekMode;
    }
    if (b.tablesPerLevel !== undefined) {
      if (!isPositiveInt(b.tablesPerLevel) || b.tablesPerLevel > 5) {
        return { error: 'botMode.tablesPerLevel: 1..5' };
      }
      bmPatch.tablesPerLevel = b.tablesPerLevel;
    }
    if (b.botsPerTable !== undefined) {
      if (!isPositiveInt(b.botsPerTable) || b.botsPerTable < 2 || b.botsPerTable > 8) {
        return { error: 'botMode.botsPerTable: 2..8' };
      }
      bmPatch.botsPerTable = b.botsPerTable;
    }
    if (b.defaultBuyInBb !== undefined) {
      if (!isPositiveInt(b.defaultBuyInBb) || b.defaultBuyInBb < 20 || b.defaultBuyInBb > 1000) {
        return { error: 'botMode.defaultBuyInBb: 20..1000' };
      }
      bmPatch.defaultBuyInBb = b.defaultBuyInBb;
    }
    if (b.refillIntervalMs !== undefined) {
      if (!isPositiveInt(b.refillIntervalMs) || b.refillIntervalMs < 30000 || b.refillIntervalMs > 600000) {
        return { error: 'botMode.refillIntervalMs: 30000..600000 (мс)' };
      }
      bmPatch.refillIntervalMs = b.refillIntervalMs;
    }
    patch.botMode = bmPatch;
  }

  return { patch };
}

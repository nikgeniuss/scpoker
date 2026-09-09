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
  const { turnDurationMs, autostartDelayMs, defaultPlayerChips, timebank, botMode, paidFeatures, payments, responsibleGambling } = body;
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
    if (!isNonNegInt(defaultPlayerChips) || defaultPlayerChips > 1000000) {
      return { error: 'defaultPlayerChips: 0–1000000' };
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
  if (paidFeatures !== undefined) {
    if (!paidFeatures || typeof paidFeatures !== 'object') {
      return { error: 'paidFeatures: object' };
    }
    const pf = paidFeatures as Record<string, unknown>;
    const pfPatch: Record<string, unknown> = {};
    if (pf.rabbitHunt !== undefined) {
      if (!pf.rabbitHunt || typeof pf.rabbitHunt !== 'object') {
        return { error: 'paidFeatures.rabbitHunt: object' };
      }
      const rh = pf.rabbitHunt as Record<string, unknown>;
      const rhPatch: Record<string, unknown> = {};
      if (rh.enabled !== undefined) {
        if (typeof rh.enabled !== 'boolean') {
          return { error: 'paidFeatures.rabbitHunt.enabled: boolean' };
        }
        rhPatch.enabled = rh.enabled;
      }
      if (rh.mode !== undefined) {
        if (rh.mode !== 'fixed' && rh.mode !== 'percent') {
          return { error: 'paidFeatures.rabbitHunt.mode: "fixed" | "percent"' };
        }
        rhPatch.mode = rh.mode;
      }
      if (rh.fixedAmount !== undefined) {
        if (!isNonNegInt(rh.fixedAmount) || rh.fixedAmount > 1000000) {
          return { error: 'paidFeatures.rabbitHunt.fixedAmount: 0..1000000' };
        }
        rhPatch.fixedAmount = rh.fixedAmount;
      }
      if (rh.percent !== undefined) {
        if (typeof rh.percent !== 'number' || !Number.isFinite(rh.percent) || rh.percent < 0 || rh.percent > 100) {
          return { error: 'paidFeatures.rabbitHunt.percent: 0..100' };
        }
        rhPatch.percent = rh.percent;
      }
      pfPatch.rabbitHunt = rhPatch;
    }
    // Режим HUD (§10.21.13): free — статистика соперников видна всем, paid — только по подписке.
    if (pf.hudMode !== undefined) {
      if (pf.hudMode !== 'free' && pf.hudMode !== 'paid') {
        return { error: 'paidFeatures.hudMode: "free" | "paid"' };
      }
      pfPatch.hudMode = pf.hudMode;
    }
    if (Object.keys(pfPatch).length > 0) patch.paidFeatures = pfPatch;
  }
  if (payments !== undefined) {
    if (!payments || typeof payments !== 'object') {
      return { error: 'payments: object' };
    }
    const p = payments as Record<string, unknown>;
    const pmPatch: Record<string, unknown> = {};
    if (p.enabled !== undefined) {
      if (typeof p.enabled !== 'boolean') {
        return { error: 'payments.enabled: boolean' };
      }
      pmPatch.enabled = p.enabled;
    }
    if (p.exchangeRateCentsPerUsdt !== undefined) {
      if (!isPositiveInt(p.exchangeRateCentsPerUsdt) || p.exchangeRateCentsPerUsdt > 10000000) {
        return { error: 'payments.exchangeRateCentsPerUsdt: 1..10000000' };
      }
      pmPatch.exchangeRateCentsPerUsdt = p.exchangeRateCentsPerUsdt;
    }
    const isPositiveAmount = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000000;
    for (const key of ['minDepositUsdt', 'maxDepositUsdt', 'minWithdrawalUsdt', 'maxWithdrawalUsdt'] as const) {
      const v = p[key];
      if (v !== undefined) {
        if (!isPositiveAmount(v)) {
          return { error: `payments.${key}: 0..1000000 (USDT)` };
        }
        pmPatch[key] = v;
      }
    }
    if (p.chains !== undefined) {
      if (!p.chains || typeof p.chains !== 'object') {
        return { error: 'payments.chains: object' };
      }
      const chainsObj = p.chains as Record<string, unknown>;
      const chainsPatch: Record<string, unknown> = {};
      for (const chain of ['tron', 'ethereum', 'bsc'] as const) {
        const c = chainsObj[chain];
        if (c === undefined) continue;
        if (!c || typeof c !== 'object') {
          return { error: `payments.chains.${chain}: object` };
        }
        const cObj = c as Record<string, unknown>;
        const cPatch: Record<string, unknown> = {};
        if (cObj.enabled !== undefined) {
          if (typeof cObj.enabled !== 'boolean') {
            return { error: `payments.chains.${chain}.enabled: boolean` };
          }
          cPatch.enabled = cObj.enabled;
        }
        if (cObj.minConfirmations !== undefined) {
          if (!isPositiveInt(cObj.minConfirmations) || cObj.minConfirmations > 1000) {
            return { error: `payments.chains.${chain}.minConfirmations: 1..1000` };
          }
          cPatch.minConfirmations = cObj.minConfirmations;
        }
        chainsPatch[chain] = cPatch;
      }
      pmPatch.chains = chainsPatch;
    }
    patch.payments = pmPatch;
  }
  if (responsibleGambling !== undefined) {
    if (!responsibleGambling || typeof responsibleGambling !== 'object') {
      return { error: 'responsibleGambling: object' };
    }
    const rg = responsibleGambling as Record<string, unknown>;
    const rgPatch: Record<string, unknown> = {};
    for (const key of [
      'depositLimitEnabled',
      'lossLimitEnabled',
      'sessionTimeLimitEnabled',
      'selfExclusionEnabled',
      'timeoutEnabled',
    ] as const) {
      const v = rg[key];
      if (v !== undefined) {
        if (typeof v !== 'boolean') {
          return { error: `responsibleGambling.${key}: boolean` };
        }
        rgPatch[key] = v;
      }
    }
    patch.responsibleGambling = rgPatch;
  }

  return { patch };
}

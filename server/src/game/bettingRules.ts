// Правила ставок NLH — чистые функции. Вынесены из handlePlayerAction (ROADMAP §9.3-B).
// Здесь зафиксировано ТЕКУЩЕЕ поведение (рефактор без смены логики). Сверка с POKER_RULES.md
// и закрытие известных расхождений A1/A3 — отдельная задача, НЕ этот рефактор (§0.5).

// Минимальный размер рейза «to»: ≥ max(2×currentBet, currentBet + bigBlind).
export function minRaiseTo(currentBet: number, bigBlind: number): number {
  return Math.max(currentBet * 2, currentBet + bigBlind);
}

// Легален ли raise «to amount».
// Исключение: all-in остатком меньше min-raise разрешён (защита от lock-out коротких стеков).
export function isLegalRaise(
  amount: number | undefined,
  currentBet: number,
  bigBlind: number,
  playerChips: number,
  playerCurrentBet: number,
): boolean {
  if (!amount || amount <= currentBet) return false;
  const wouldBeAllIn = amount >= playerChips + playerCurrentBet;
  return amount >= minRaiseTo(currentBet, bigBlind) || wouldBeAllIn;
}

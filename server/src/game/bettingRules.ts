// Правила ставок NLH — чистые функции. Вынесены из handlePlayerAction (ROADMAP §9.3-B).
// A1 (§5.1) и A3 (§5.2) POKER_RULES.md закрыты: minRaiseTo использует lastRaiseSize,
// incomplete all-in не открывает action для уже сходивших (lockedCallers в GameManager).

// Минимальный размер рейза «to»: currentBet + lastRaiseSize (POKER_RULES §5.1).
// lastRaiseSize = размер последнего полного raise в этом круге (инициализируется BB).
export function minRaiseTo(currentBet: number, lastRaiseSize: number): number {
  return currentBet + lastRaiseSize;
}

// Легален ли raise «to amount».
// Исключение: all-in остатком меньше min-raise разрешён (защита от lock-out коротких стеков).
export function isLegalRaise(
  amount: number | undefined,
  currentBet: number,
  lastRaiseSize: number,
  playerChips: number,
  playerCurrentBet: number,
): boolean {
  if (!amount || amount <= currentBet) return false;
  const wouldBeAllIn = amount >= playerChips + playerCurrentBet;
  return amount >= minRaiseTo(currentBet, lastRaiseSize) || wouldBeAllIn;
}

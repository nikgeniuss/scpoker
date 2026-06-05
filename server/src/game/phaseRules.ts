import type { Room } from './GameManager.js';

// Чистые предикаты фазы раздачи — вынесены из GameManager (ROADMAP §9.3-B, seed PhaseMachine).
// Мутации/раздача карт (advancePhase) остаются в GameManager.

// Закрыт ли круг ставок: каждый не-сфолдивший игрок либо all-in (chips=0),
// либо уже действовал в этом круге И его ставка сравнялась с текущей.
export function isRoundComplete(room: Room): boolean {
  const activePlayers = Array.from(room.players.values()).filter(p => !p.isFolded);
  return activePlayers.every(p => {
    if (p.chips === 0) return true;
    return room.actionsThisRound.has(p.id) && p.currentBet === room.currentBet;
  });
}

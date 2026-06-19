import type { Room } from './GameManager.js';
import { dealCommunityCards } from './deck.js';
import type { Card, GamePhase } from './types.js';

// Чистые функции фазы раздачи — вынесены из GameManager (ROADMAP §9.3-B, PhaseMachine).
// Мутации board/broadcast остаются в GameManager.

// Закрыт ли круг ставок: каждый не-сфолдивший игрок либо all-in (chips=0),
// либо уже действовал в этом круге И его ставка сравнялась с текущей.
export function isRoundComplete(room: Room): boolean {
  const activePlayers = Array.from(room.players.values()).filter(p => !p.isFolded);
  return activePlayers.every(p => {
    if (p.chips === 0) return true;
    return room.actionsThisRound.has(p.id) && p.currentBet === room.currentBet;
  });
}

export interface PhaseTransition {
  nextPhase: GamePhase;
  newCards: Card[];       // новые карты борда в этой фазе (пусто → showdown)
  remainingDeck: Card[];
  isShowdown: boolean;
}

// Чистый переход фазы: что раздать и куда двигаться. Не мутирует Room.
export function computePhaseTransition(phase: GamePhase, deck: Card[]): PhaseTransition {
  switch (phase) {
    case 'preflop': {
      const { cards, remainingDeck } = dealCommunityCards(deck, 3);
      return { nextPhase: 'flop', newCards: cards, remainingDeck, isShowdown: false };
    }
    case 'flop': {
      const { cards, remainingDeck } = dealCommunityCards(deck, 1);
      return { nextPhase: 'turn', newCards: cards, remainingDeck, isShowdown: false };
    }
    case 'turn': {
      const { cards, remainingDeck } = dealCommunityCards(deck, 1);
      return { nextPhase: 'river', newCards: cards, remainingDeck, isShowdown: false };
    }
    default: // 'river'
      return { nextPhase: 'showdown', newCards: [], remainingDeck: deck, isShowdown: true };
  }
}

// Rabbit Hunting (ROADMAP §10.12) — чистые функции: считаем доступность/цену для законченной
// раздачи и проверяем, можно ли провести оплату. Сама мутация (списание фишек, лог в statsRecorder,
// broadcast) остаётся в GameManager.requestRabbitHunt — это io/state-связанный эффект.
import { getFutureBoardCards } from './deck.js';
import type { Card } from './types.js';

export interface RabbitHuntConfig {
  enabled: boolean;
  mode: 'fixed' | 'percent';
  fixedAmount: number;
  percent: number;
}

export interface RabbitHuntEligibility {
  price: number;
  cards: Card[];
}

// Вызывается из endGame ДО первого broadcastGameState. null — фича недоступна для этой раздачи
// (выключена в настройках, борд уже полный 5 карт, либо цена вышла 0).
export function computeRabbitHuntEligibility(
  config: RabbitHuntConfig,
  potTotal: number,
  communityCardsCount: number,
  deck: Card[],
): RabbitHuntEligibility | null {
  if (!config.enabled || communityCardsCount >= 5) return null;
  const price = config.mode === 'percent'
    ? Math.max(1, Math.floor((potTotal * config.percent) / 100))
    : config.fixedAmount;
  if (price <= 0) return null;
  return { price, cards: getFutureBoardCards(deck, communityCardsCount) };
}

// Все условия-гварды requestRabbitHunt, кроме существования комнаты/игрока (это остаётся в GameManager).
export function canPayRabbitHunt(
  phase: string,
  price: number | undefined,
  cards: Card[] | undefined,
  alreadyPaid: boolean,
  playerChips: number,
): boolean {
  if (phase !== 'showdown') return false;
  if (!cards || price === undefined) return false;
  if (alreadyPaid) return false;
  if (playerChips < price) return false;
  return true;
}

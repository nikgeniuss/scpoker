import type { Room, GameState } from './GameManager.js';
import { getFutureBoardCards } from './deck.js';

// §0.1 — ЕДИНСТВЕННОЕ место, где решается, кому какие карты уходят (была реальная утечка, фикс 2026-05-17).
// Сериализует состояние стола для КОНКРЕТНОГО зрителя:
//   - viewerId — видит свои карты (если он за столом);
//   - showdown — карты раскрываются ВСЕМ;
//   - withPeek (глаз админа) — карты всех + futureBoard (caller обязан проверить роль!).
// Без viewerId/peek вне showdown — карт нет ни у кого (безопасный дефолт).
// Чистая функция (Room → GameState) — тестируется изолированно (gameStateSerializer.test.ts).
export function serializeGameState(room: Room, viewerId?: string, withPeek = false): GameState {
  const tbOn = room.timebank.enabled;
  const isShowdown = room.phase === 'showdown';
  const players = Array.from(room.players.values()).map(p => {
    const canSeeCards = withPeek || isShowdown || (viewerId !== undefined && p.id === viewerId);
    return {
      id: p.id,
      username: p.username,
      chips: p.chips,
      cards: canSeeCards ? p.cards : [],
      isActive: p.isActive,
      isFolded: p.isFolded,
      currentBet: p.currentBet,
      position: p.position,
      avatar: p.avatar,
      disconnected: p.disconnected,
      // timebank пробрасываем только если он включён на столе — UI решит что рисовать
      timebank: tbOn ? p.timebank : undefined,
    };
  });
  return {
    roomId: room.id,
    roomName: room.name,
    players,
    communityCards: room.communityCards,
    pot: room.pot,
    currentBet: room.currentBet,
    dealerIndex: room.dealerIndex,
    currentPlayerIndex: room.currentPlayerIndex,
    phase: room.phase,
    winners: null,
    turnEndsAt: room.turnEndsAt,
    turnDurationSec: Math.round(room.turnDurationMs / 1000),
    turnTimebankEndsAt: room.turnTimebankEndsAt,
    turnTimebankStartedAt: room.turnTimebankStartedAt,
    timebankEnabled: tbOn,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    // Будущие community-карты для admin-peek. Учитываем burn-карты (dealCommunityCards
    // сжигает по 1 перед каждым флопом/тёрном/ривером) — иначе peek показывал бы карты
    // с дна колоды, которые никогда не выйдут.
    futureBoard: withPeek ? getFutureBoardCards(room.deck, room.communityCards.length) : undefined,
  };
}

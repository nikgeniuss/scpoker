import type { Room } from './GameManager.js';
import type { GameState } from '@poker-room/shared';
import { getFutureBoardCards } from './deck.js';
import { handHintName } from './handHint.js';
import { getBadBeatState } from './badBeatService.js';

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
  // Карты авто-раскрываются ТОЛЬКО при реальном вскрытии — когда ≥2 игроков дошли до showdown
  // (боролись за банк). Выигрыш без вскрытия (все сфолдили, остался один) тоже идёт через
  // phase='showdown' (endGame), но раскрывать единственного победителя нельзя — он не вскрывался.
  const contestedShowdown =
    isShowdown && Array.from(room.players.values()).filter(p => !p.isFolded && p.cards.length > 0).length >= 2;
  // Подсказку считаем только если ЗРИТЕЛЬ её включил (тумблер). Будущие карты — лениво (для админа).
  const viewer = viewerId !== undefined ? room.players.get(viewerId) : undefined;
  const wantsHint = !!viewer?.wantsHint;
  const futureBoard = withPeek ? getFutureBoardCards(room.deck, room.communityCards.length) : [];
  const players = Array.from(room.players.values()).map(p => {
    // §0.1: при реальном вскрытии карты видны ТОЛЬКО дошедшим до showdown (не сфолдившим — они
    // боролись за банк). Сфолдившие мак'ают: их карты не видны соперникам (но виден own — p.id===viewerId).
    const canSeeCards = withPeek || (contestedShowdown && !p.isFolded) || (viewerId !== undefined && p.id === viewerId);
    // Название комбинации — только тем, кому видны карты (§0.1), и только если зритель включил подсказку.
    let handHint: string | undefined;
    if (wantsHint && canSeeCards && !p.isFolded && p.cards.length >= 2) {
      if (withPeek && p.id === viewerId) {
        // Админ на СВОЁМ месте — ИТОГОВАЯ комбинация (борд + будущие карты до 5).
        handHint = handHintName(p.cards, room.communityCards.concat(futureBoard).slice(0, 5), room.format);
      } else {
        // Все прочие (вкл. чужих для админа) — ТЕКУЩАЯ комбинация по открытому борду.
        handHint = handHintName(p.cards, room.communityCards, room.format);
      }
    }
    // Шанс на выигрыш — только своё место (считается сервером против случайных, без утечки).
    const winChance = wantsHint && viewerId !== undefined && p.id === viewerId ? p.winChance : undefined;
    // Добровольно показанные карты — публичны (видны всем): отдаём только выбранные индексы,
    // непоказанные остаются null (не утекают). У уже полностью раскрытых (own/peek/contest) — не дублируем.
    const shownCards = !canSeeCards && p.revealedCards && p.revealedCards.length > 0 && p.cards.length >= 2
      ? ([0, 1].map(i => (p.revealedCards!.includes(i) ? p.cards[i] : null)) as (typeof p.cards[number] | null)[])
      : undefined;
    return {
      id: p.id,
      username: p.username,
      displayName: p.displayName,
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
      handHint,
      winChance,
      shownCards,
      revealedCards: p.revealedCards,
      hudStats: p.hudStats,
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
    format: room.format,
    rake: room.rake,
    // Rabbit Hunting (§10.12): цена видна всем за столом, раскрытые карты — только оплатившему
    // (персонально, как и подсказки/winChance выше) — не публичный broadcast.
    rabbitHunt:
      room.rabbitHuntCards && room.rabbitHuntPrice !== undefined
        ? {
            price: room.rabbitHuntPrice,
            revealed: viewerId !== undefined && room.rabbitHuntPaidBy?.has(viewerId) ? room.rabbitHuntCards : null,
          }
        : undefined,
    badBeatEligible: getBadBeatState().enabled && room.passwordHash === null && !room.isBotTable,
    observers: room.observers ? Array.from(room.observers.values()).map(o => ({ id: o.userId, username: o.username })) : [],
    // Будущие community-карты для admin-peek. Учитываем burn-карты (dealCommunityCards
    // сжигает по 1 перед каждым флопом/тёрном/ривером) — иначе peek показывал бы карты
    // с дна колоды, которые никогда не выйдут.
    futureBoard: withPeek ? getFutureBoardCards(room.deck, room.communityCards.length) : undefined,
    tournamentId: room.tournamentId,
  };
}

// Чистая логика распределения банка по side-pot слоям.
// Не мутирует состояние — возвращает chip-дельты, которые вызывающий применяет сам.
// Симметрично bettingRules.ts / phaseRules.ts / rake.ts.
import { evaluateHand, determineWinner, formatHandName } from './hands.js';
import { computeRake, type RakeConfig } from './rake.js';
import { computeBadBeatDrop } from './badBeatDrop.js';
import type { BadBeatState } from './badBeatService.js';
import type { Card, GameFormat } from './types.js';

export interface ShowdownPlayer {
  id: string;
  username?: string;
  cards: Card[];
  totalCommitted: number;
}

export interface ShowdownResult {
  winners: string[];
  handInfo?: { name: string; cards: Card[] };
  amounts: Record<string, number>; // userId → сколько выиграл (chip delta)
  rake: number;
  badBeatDrop: number;
}

export function resolveShowdown(
  pot: number,
  communityCards: Card[],
  bigBlind: number,
  rakeConfig: RakeConfig,
  format: GameFormat,
  allPlayers: ShowdownPlayer[],
  active: ShowdownPlayer[],
  badBeat: BadBeatState | null,
): ShowdownResult {
  if (active.length === 0) {
    return { winners: [], amounts: {}, rake: 0, badBeatDrop: 0 };
  }

  const flopDealt = communityCards.length >= 3;
  const rakeTotal = computeRake(pot, bigBlind, rakeConfig, flopDealt);
  const badBeatTotal = badBeat ? computeBadBeatDrop(badBeat, pot - rakeTotal, bigBlind) : 0;

  let rakeRemaining = rakeTotal;
  let badBeatRemaining = badBeatTotal;
  let badBeatCollected = 0;

  // Уровни commitments активных — уникальные, отсортированные.
  // Folded в levels не входят, но их contribution учитывается в layerPot.
  const levels = Array.from(new Set(active.map(p => p.totalCommitted))).sort((a, b) => a - b);
  const winnerSet = new Set<string>();
  const amounts: Record<string, number> = {};
  let mainHandInfo: { name: string; cards: Card[] } | undefined;
  let prevLevel = 0;

  for (const level of levels) {
    const take = level - prevLevel;
    if (take <= 0) {
      prevLevel = level;
      continue;
    }

    // layerPot = сумма contributions всех игроков (вкл. folded) в этот слой
    let layerPot = 0;
    for (const p of allPlayers) {
      layerPot += Math.max(0, Math.min(take, p.totalCommitted - prevLevel));
    }

    // Победители слоя — лучшая рука среди eligible (active с commit >= level)
    const eligible = active.filter(p => p.totalCommitted >= level);
    const layerWinners = determineWinner(
      eligible.map(p => ({ id: p.id, hand: p.cards, folded: false })),
      communityCards,
      format,
    );

    if (layerWinners.length > 0 && layerPot > 0) {
      // Удержать рейк с этого слоя пропорционально его доле в банке
      let layerRake = pot > 0 ? Math.floor((rakeTotal * layerPot) / pot) : 0;
      if (layerRake > rakeRemaining) layerRake = rakeRemaining;
      rakeRemaining -= layerRake;

      // Bad Beat дроп с этого слоя — пропорционально (как рейк)
      let layerBadBeat = pot > 0 ? Math.floor((badBeatTotal * layerPot) / pot) : 0;
      if (layerBadBeat > badBeatRemaining) layerBadBeat = badBeatRemaining;
      badBeatRemaining -= layerBadBeat;
      badBeatCollected += layerBadBeat;

      const distributable = layerPot - layerRake - layerBadBeat;
      const share = Math.floor(distributable / layerWinners.length);
      const remainder = distributable - share * layerWinners.length;

      layerWinners.forEach((id, idx) => {
        const won = share + (idx === 0 ? remainder : 0);
        amounts[id] = (amounts[id] ?? 0) + won;
        winnerSet.add(id);
      });

      // Информация о руке — из главного слоя (первый, обычно main pot)
      if (!mainHandInfo) {
        const firstWinner = eligible.find(p => p.id === layerWinners[0]);
        if (firstWinner && firstWinner.cards.length > 0) {
          const hr = evaluateHand(firstWinner.cards, communityCards, format);
          mainHandInfo = { name: formatHandName(hr), cards: hr.cards };
        }
      }

      const winnerNames = layerWinners
        .map(id => eligible.find(p => p.id === id)?.username ?? id)
        .join(', ');
      const layerLabel = levels.length > 1 ? `[layer commit≤${level}]` : '';
      console.log(
        `   🥇 ${layerLabel} pot=${layerPot} → ${winnerNames} +${share}` +
        (layerWinners.length > 1 ? ` (split ${layerWinners.length}-way)` : ''),
      );
    }

    prevLevel = level;
  }

  return {
    winners: Array.from(winnerSet),
    handInfo: mainHandInfo,
    amounts,
    rake: rakeTotal,
    badBeatDrop: badBeatCollected,
  };
}

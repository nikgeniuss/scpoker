// Double Board / RIMT (доделка §10.6) — несколько независимых бордов на одну раздачу,
// банк делится поровну между прогонами. Симметрично showdownService.ts/rake.ts.
import { resolveShowdown, type ShowdownPlayer, type ShowdownResult } from './showdownService.js';
import type { RakeConfig } from './rake.js';
import type { Card, GameFormat } from './types.js';

// ВАЖНО: resolveShowdown распределяет деньги по totalCommitted игроков, а не по своему
// pot-параметру (pot влияет только на пропорцию рейка/бэдбит-дропа). Поэтому просто
// просуммировать результаты N независимых вызовов (по борду на вызов) — нельзя, банк
// удвоится. Каждый вызов получает ПОЛНЫЙ банк/рейк (как при одиночном борде) и возвращает
// «что было бы, если бы решал только этот борд»; результаты УСРЕДНЯЮТСЯ — это единственный
// способ честно разделить ОДИН банк между несколькими прогонами. Bad Beat детекция —
// всегда пропускается (badBeat=null на каждый вызов): нет единого финального борда для
// проверки квалифицирующей руки.
export function resolveMultiRunShowdown(
  pot: number,
  boards: Card[][],
  bigBlind: number,
  rakeConfig: RakeConfig,
  format: GameFormat,
  allPlayers: ShowdownPlayer[],
  active: ShowdownPlayer[],
): ShowdownResult {
  const runs = boards.length;
  const perBoard = boards.map((board) =>
    resolveShowdown(pot, board, bigBlind, rakeConfig, format, allPlayers, active, null),
  );

  const winnerSet = new Set<string>();
  const idSet = new Set<string>();
  perBoard.forEach((r) => {
    r.winners.forEach((id) => winnerSet.add(id));
    Object.keys(r.amounts).forEach((id) => idSet.add(id));
  });

  const amounts: Record<string, number> = {};
  idSet.forEach((id) => {
    const sum = perBoard.reduce((acc, r) => acc + (r.amounts[id] ?? 0), 0);
    amounts[id] = Math.floor(sum / runs);
  });

  // Целостность банка: остаток от округления (центы) — детерминированно первому победителю.
  const idealTotal = Object.values(perBoard[0]?.amounts ?? {}).reduce((a, b) => a + b, 0);
  const actualTotal = Object.values(amounts).reduce((a, b) => a + b, 0);
  const leftover = idealTotal - actualTotal;
  if (leftover > 0) {
    const firstId = Array.from(winnerSet)[0] ?? Array.from(idSet)[0];
    if (firstId !== undefined) amounts[firstId] = (amounts[firstId] ?? 0) + leftover;
  }

  return {
    winners: Array.from(winnerSet),
    handInfo: perBoard[0]?.handInfo,
    amounts,
    rake: perBoard[0]?.rake ?? 0,
    badBeatDrop: 0,
  };
}

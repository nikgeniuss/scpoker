export interface TableSeats {
  tableId: string;
  count: number;
}

// План одного переноса игрока с самого полного стола на самый пустой, когда разница ≥2 мест
// (стандартное правило балансировки MTT). null — баланс уже в норме или стол один. Чистая функция,
// конкретного игрока для переноса выбирает вызывающий код (TournamentManager).
export function planRebalanceMove(tables: TableSeats[]): { from: string; to: string } | null {
  if (tables.length < 2) return null;
  const sorted = [...tables].sort((a, b) => b.count - a.count);
  const fullest = sorted[0];
  const emptiest = sorted[sorted.length - 1];
  if (fullest.count - emptiest.count < 2) return null;
  return { from: fullest.tableId, to: emptiest.tableId };
}

// Сколько столов должно остаться при данном числе живых игроков и размере стола.
export function idealTableCount(aliveCount: number, tableSize: number): number {
  return Math.max(1, Math.ceil(aliveCount / tableSize));
}

// Какой стол закрыть при консолидации (наименее населённый), если столов больше идеального
// количества. null — консолидация не нужна.
export function pickTableToClose(tables: TableSeats[], aliveCount: number, tableSize: number): string | null {
  if (tables.length <= idealTableCount(aliveCount, tableSize)) return null;
  const sorted = [...tables].sort((a, b) => a.count - b.count);
  return sorted[0].tableId;
}

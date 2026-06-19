// Геометрия анимации раздачи (ROADMAP §10.1) — чистый расчёт, отдельно от компонента
// (react-refresh: файл-компонент экспортирует только компонент).

// Одна «летящая» карта раздачи: от дилера (from) к месту игрока (to), в % координатах
// контейнера-стола. delay — задержка старта (для последовательной раздачи по кругу).
export interface DealCard {
  id: string;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  delay: number;
}

// Сборка списка летящих карт: каждому месту по 2 карты, раздаются в ДВА круга
// (сначала по одной всем, потом вторая) — как настоящая сдача от дилера.
export function buildDealCards(
  positions: { player: { id: string }; left: number; top: number }[],
  dealerId: string | null,
): DealCard[] {
  if (positions.length === 0) return [];
  const dealer = positions.find((p) => p.player.id === dealerId) ?? positions[0];
  const step = 0.08; // задержка между картами
  const out: DealCard[] = [];
  for (let round = 0; round < 2; round++) {
    positions.forEach((p, i) => {
      out.push({
        id: p.player.id + '-' + round,
        fromLeft: dealer.left,
        fromTop: dealer.top,
        toLeft: p.left,
        toTop: p.top,
        delay: (round * positions.length + i) * step,
      });
    });
  }
  return out;
}

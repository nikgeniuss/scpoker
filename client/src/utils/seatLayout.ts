// Формулы рассадки игроков по овалу (mobile портретный layout).
// `me` всегда индекс 0 = bottom-center (6 часов), остальные по часовой стрелке.
// Координаты в % внутри овала. См. план Plan-агента §1.

export interface SeatPos {
  // % от овала-родителя (0..100)
  left: number;
  top: number;
  // позиция bet-стопки между seat и центром
  chipLeft: number;
  chipTop: number;
  // позиция D/SB/BB-бейджа: прижат к плашке со стороны центра стола
  dealerLeft: number;
  dealerTop: number;
}

// Конкретные координаты для N=2..9 — посчитаны/выверены вручную, чтобы плашки
// не накладывались при 9-max и не вылезали за rail на heads-up.
// rx=50, ry=48 — координаты на ~95% овала (seats сидят НА rail-краю как ClubGG, см. design-review приоритет 2).
const PRESETS: Record<number, Array<[number, number]>> = {
  2: [
    [50, 85], // me (bottom) — поднял с 88 на 85 (~12px вверх на 667-viewport)
    [50, 4],  // top
  ],
  3: [
    [50, 85], // me
    [4, 22],  // top-left
    [96, 22], // top-right
  ],
  4: [
    [50, 85], // me
    [10, 50], // left  (был 3 — Tania-плашка вылазила за rail)
    [50, 4],  // top
    [90, 50], // right (был 97 — Pavel_R-плашка вылазила за rail)
  ],
  5: [
    [50, 85], // me
    [10, 60],  // left
    [16, 8],  // top-left
    [84, 8],  // top-right
    [90, 60], // right
  ],
  6: [
    [50, 85], // me
    [10, 70], // bottom-left (был 3)
    [10, 26], // top-left (был 3)
    [50, 4],  // top
    [90, 26], // top-right (был 97)
    [90, 70], // bottom-right (был 97)
  ],
  7: [
    [50, 88],
    [8, 76],
    [2, 48],
    [18, 8],
    [82, 8],
    [98, 48],
    [92, 76],
  ],
  8: [
    [50, 88],
    [10, 80],
    [2, 56],
    [6, 18],
    [50, 4],
    [94, 18],
    [98, 56],
    [90, 80],
  ],
  9: [
    [50, 88],
    [19, 82],
    [1, 64],
    [1, 36],
    [19, 10],
    [50, 4],
    [81, 10],
    [99, 36],
    [99, 64],
  ],
};

// Возвращает массив seat-позиций длиной N, индекс 0 — me (bottom-center).
// chipLeft/chipTop — точка для bet-стопки, на 48% радиуса от центра (между seat и центром).
export function buildSeatLayout(N: number): SeatPos[] {
  const preset = PRESETS[N] || PRESETS[6];
  return preset.map(([left, top]) => {
    // Стопка фишек идёт по той же оси от центра, но ближе к центру.
    const dx = left - 50;
    const dy = top - 50;
    const tChip = 0.48; // 48% пути от seat к центру (фишки ближе к центру)
    const tDealer = 0.10; // 10% пути — бейдж прижат к плашке со стороны центра стола
    return {
      left,
      top,
      chipLeft: left - dx * tChip,
      chipTop: top - dy * tChip,
      dealerLeft: left - dx * tDealer,
      dealerTop: top - dy * tDealer,
    };
  });
}

// Логика шкалы силы руки — вынесено из HandStrengthMeter.tsx в отдельный модуль, чтобы
// файл-компонент экспортировал только компонент (правило react-refresh/only-export-components,
// см. turnColors.ts).

export const SEGMENTS = 9;

// Сколько сегментов закрашено при данном rank (1..9, см. shared Player.handRank).
export function filledSegments(rank: number, total: number = SEGMENTS): number {
  return Math.max(0, Math.min(total, Math.round(rank)));
}

// Цвет закрашенного сегмента: интерполяция зелёный (начало) → жёлтый (у текущего ранга).
const FROM = [34, 197, 94]; // tailwind green-500
const TO = [250, 204, 21]; // tailwind yellow-400

export function segmentColor(index: number, filled: number): string {
  const t = filled <= 1 ? 1 : index / (filled - 1);
  const [r1, g1, b1] = FROM;
  const [r2, g2, b2] = TO;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

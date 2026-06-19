// Номиналы фишек — ФИКСИРОВАННАЯ лестница (как реальный набор казино), чтобы собрать ЛЮБОЙ банк.
// Младший = 1 цент (минимальная единица денег в проекте, см. chipFormat.ts) → любая сумма точна.
// 11 цветов = 11 номиналов: 0.01,0.05,0.25,1,5,25,100,500,1000,5000,25000.

export type ChipColorName =
  | 'white' | 'pink' | 'cyan' | 'blue' | 'red' | 'green'
  | 'black' | 'purple' | 'orange' | 'gold' | 'brown';

export interface ChipDenom {
  color: ChipColorName;
  value: number; // в центах
}

export interface ChipGroup extends ChipDenom {
  count: number;
}

// Лестница номиналов (по возрастанию value). value — в центах.
export const CHIP_LADDER: ChipDenom[] = [
  { color: 'white', value: 1 },        // 0.01
  { color: 'pink', value: 5 },         // 0.05
  { color: 'cyan', value: 25 },        // 0.25
  { color: 'blue', value: 100 },       // 1
  { color: 'red', value: 500 },        // 5
  { color: 'green', value: 2500 },     // 25
  { color: 'black', value: 10000 },    // 100
  { color: 'purple', value: 50000 },   // 500
  { color: 'orange', value: 100000 },  // 1000
  { color: 'gold', value: 500000 },    // 5000
  { color: 'brown', value: 2500000 },  // 25000
];

// Светлые фишки — номинал по центру пишем тёмным (белый на светлом не виден).
export const CHIP_TEXT_DARK = new Set<ChipColorName>(['white', 'gold']);

// Точная разбивка суммы на группы фишек (от крупных к мелким). Младший номинал = 1 цент →
// остатка не остаётся, любой банк представляется точно. Возвращает только использованные номиналы.
export function breakIntoChipGroups(amount: number): ChipGroup[] {
  const groups: ChipGroup[] = [];
  if (amount <= 0) return groups;
  let rem = Math.floor(amount);
  for (let i = CHIP_LADDER.length - 1; i >= 0; i--) {
    const d = CHIP_LADDER[i];
    const count = Math.floor(rem / d.value);
    if (count > 0) {
      groups.push({ ...d, count });
      rem -= count * d.value;
    }
  }
  return groups; // по убыванию номинала
}

// Подпись номинала по центру фишки: центы — десятичные «0.01/0.05/0.25» (так понятнее),
// доллары — числом «1/5/25/100/500», тысячи — «1K/5K/25K». Влезание под длину строки
// обеспечивает Chip.tsx (кегль ужимается для длинных подписей).
export function denomLabel(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) {
    const k = d / 1000;
    return (Number.isInteger(k) ? String(k) : (+k.toFixed(1)).toString()) + 'K';
  }
  if (Number.isInteger(d)) return String(d);
  return (+d.toFixed(2)).toString();
}

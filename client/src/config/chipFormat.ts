// Отображение фишек: «как есть» или в больших блайндах (см. roadmap 10.1 в CLAUDE.md)

export type ChipDisplay = 'chips' | 'bb';

const STORAGE_KEY = 'sk:chipDisplay:v1';

export function loadChipDisplay(): ChipDisplay {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'bb' ? 'bb' : 'chips';
  } catch {
    return 'chips';
  }
}

export function saveChipDisplay(v: ChipDisplay): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

// Деньги в проекте — целые ЦЕНТЫ (1 единица = 1 цент). Отображение — дробное до центов,
// без знака валюты (как в эталоне): 1 → "0.01", 1000 → "10.00", 2080874 → "20,808.74".
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Разбор введённой пользователем суммы в долларах → целые центы (для money-input'ов).
export function parseMoney(str: string): number {
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Форматирует сумму с учётом режима. 'chips' — деньги в центах (дробно); 'bb' — в больших блайндах.
export function formatChips(amount: number, bigBlind: number, mode: ChipDisplay): string {
  if (mode === 'bb' && bigBlind > 0) {
    const bb = amount / bigBlind;
    // 1 знак после запятой; целые без хвоста
    const rounded = Math.round(bb * 10) / 10;
    return (Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)) + ' ББ';
  }
  return formatMoney(amount);
}

// Утилиты для отображения страны игрока (см. roadmap 10.8 в CLAUDE.md)

// Краткий список стран — расширять по мере необходимости.
// На Windows-браузерах флаги-emoji могут не отображаться (показываются как буквы 'RU') —
// это OK как fallback.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'RU', name: 'Россия' },
  { code: 'BY', name: 'Беларусь' },
  { code: 'UA', name: 'Украина' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'AM', name: 'Армения' },
  { code: 'AZ', name: 'Азербайджан' },
  { code: 'GE', name: 'Грузия' },
  { code: 'UZ', name: 'Узбекистан' },
  { code: 'KG', name: 'Киргизия' },
  { code: 'TJ', name: 'Таджикистан' },
  { code: 'TM', name: 'Туркмения' },
  { code: 'MD', name: 'Молдова' },
  { code: 'EE', name: 'Эстония' },
  { code: 'LV', name: 'Латвия' },
  { code: 'LT', name: 'Литва' },
  { code: 'US', name: 'США' },
  { code: 'GB', name: 'Великобритания' },
  { code: 'DE', name: 'Германия' },
  { code: 'FR', name: 'Франция' },
  { code: 'ES', name: 'Испания' },
  { code: 'IT', name: 'Италия' },
  { code: 'PL', name: 'Польша' },
  { code: 'CZ', name: 'Чехия' },
  { code: 'TR', name: 'Турция' },
  { code: 'IL', name: 'Израиль' },
  { code: 'CA', name: 'Канада' },
  { code: 'CN', name: 'Китай' },
  { code: 'JP', name: 'Япония' },
  { code: 'KR', name: 'Южная Корея' },
  { code: 'IN', name: 'Индия' },
  { code: 'BR', name: 'Бразилия' },
  { code: 'AR', name: 'Аргентина' },
  { code: 'AU', name: 'Австралия' },
];

// Конвертирует ISO 3166-1 alpha-2 в emoji-флаг через regional indicator pair.
// 'RU' → 🇷🇺
export function countryFlag(code: string | undefined | null): string {
  if (!code || code.length !== 2) return '';
  const A = 0x1f1e6;
  const a = code.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  const b = code.toUpperCase().charCodeAt(1) - 'A'.charCodeAt(0);
  if (a < 0 || a > 25 || b < 0 || b > 25) return '';
  return String.fromCodePoint(A + a, A + b);
}

export function countryName(code: string | undefined | null): string {
  if (!code) return '';
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase());
  return c ? c.name : code.toUpperCase();
}

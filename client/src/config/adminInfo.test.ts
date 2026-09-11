import { describe, it, expect } from 'vitest';
import { ADMIN_INFO } from './adminInfo';

// Guard подсказок админки: кнопка «i» без текста молча не открывает ничего (ровно так однажды
// оказалось в модалке создания турнира), а текст без кнопки тихо устаревает — его никто не видит
// и никто не правит. Тест сверяет ключи из ADMIN_INFO с реальными вызовами openInfo(...) в JSX.
// Исходники читаем через import.meta.glob (Vite), а не через node:fs — клиентский tsconfig
// без типов node, и тащить их сюда ради одного теста не нужно.

const SOURCES = {
  ...import.meta.glob('../pages/admin/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/admin/*.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const [path, src] of Object.entries(SOURCES)) {
    if (path.endsWith('.test.tsx')) continue;
    for (const m of src.matchAll(/openInfo\('([^']+)'\)/g)) {
      // Секции «Наград» держат свои INFO рядом с формой — у них ключи без точки ('toggle',
      // 'table'), общий словарь их не описывает.
      if (m[1].includes('.')) keys.add(m[1]);
    }
  }
  return keys;
}

describe('ADMIN_INFO — подсказки вкладок админки', () => {
  it('у каждой кнопки «i» есть текст', () => {
    const missing = [...usedKeys()].filter((k) => !ADMIN_INFO[k]).sort();
    expect(missing).toEqual([]);
  });

  it('нет текстов без кнопки', () => {
    const used = usedKeys();
    const orphans = Object.keys(ADMIN_INFO).filter((k) => !used.has(k)).sort();
    expect(orphans).toEqual([]);
  });

  it('каждый текст содержательный: заголовок и минимум одна строка', () => {
    for (const [key, entry] of Object.entries(ADMIN_INFO)) {
      expect(entry.title.length, key).toBeGreaterThan(2);
      expect(entry.lines.length, key).toBeGreaterThan(0);
      for (const line of entry.lines) expect(line.length, key).toBeGreaterThan(10);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { frameRingClass, FRAME_STYLES, tableGlowColor, TABLE_GLOW_STYLES } from './cosmetics';

describe('frameRingClass', () => {
  it('возвращает CSS-класс для каждого валидного стиля рамки', () => {
    for (const style of FRAME_STYLES) {
      expect(frameRingClass(style)).toMatch(/^ring-2 ring-/);
    }
  });

  it('undefined — пустая строка (нет рамки)', () => {
    expect(frameRingClass(undefined)).toBe('');
  });

  it('неизвестный ключ — пустая строка (не мусорит className)', () => {
    expect(frameRingClass('rainbow-glitch')).toBe('');
  });
});

describe('tableGlowColor', () => {
  it('возвращает rgba-цвет для каждого валидного стиля подсветки', () => {
    for (const style of TABLE_GLOW_STYLES) {
      expect(tableGlowColor(style)).toMatch(/^rgba\(/);
    }
  });

  it('undefined — undefined (нет подсветки, оверлей не рендерится)', () => {
    expect(tableGlowColor(undefined)).toBeUndefined();
  });

  it('неизвестный ключ — undefined', () => {
    expect(tableGlowColor('plaid')).toBeUndefined();
  });
});

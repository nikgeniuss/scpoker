import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionBubble } from './ActionBubble';

describe('<ActionBubble />', () => {
  it('дефолт: цвет по типу действия (call — синий градиент)', () => {
    render(<ActionBubble action="call" bigBlind={100} displayMode="chips" />);
    const el = screen.getByText('Колл').closest('div');
    expect(el?.className).toContain('from-blue-600');
  });

  it('variant="hero" — единый зелёный стиль независимо от действия (референс AK Poker)', () => {
    render(<ActionBubble action="call" bigBlind={100} displayMode="chips" variant="hero" />);
    const el = screen.getByText('Колл').closest('div');
    expect(el?.className).toContain('bg-emerald-600/35');
    expect(el?.className).not.toContain('from-blue-600');
  });

  it('variant="hero" на fold — тот же зелёный, а не красный', () => {
    render(<ActionBubble action="fold" bigBlind={100} displayMode="chips" variant="hero" />);
    const el = screen.getByText('Фолд').closest('div');
    expect(el?.className).toContain('bg-emerald-600/35');
    expect(el?.className).not.toContain('from-red-600');
  });
});

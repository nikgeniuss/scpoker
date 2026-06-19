import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from './Chip';

describe('<Chip />', () => {
  it('рисует подпись номинала по центру', () => {
    render(<Chip color="black" value={10000} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('центы показывает десятичной подписью', () => {
    render(<Chip color="white" value={1} />);
    expect(screen.getByText('0.01')).toBeInTheDocument();
  });

  it('подключает SVG нужного цвета', () => {
    const { container } = render(<Chip color="red" value={500} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('chips/chip-red.svg');
  });
});

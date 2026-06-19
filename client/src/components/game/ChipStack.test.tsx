import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChipStack } from './ChipStack';

describe('<ChipStack />', () => {
  it('ничего не рендерит при нулевой/отрицательной сумме', () => {
    const { container } = render(<ChipStack amount={0} bigBlind={200} displayMode="chips" />);
    expect(container.firstChild).toBeNull();
  });

  it('показывает точную подпись суммы (режим chips)', () => {
    render(<ChipStack amount={2080874} bigBlind={200} displayMode="chips" />);
    expect(screen.getByText('20,808.74')).toBeInTheDocument();
  });

  it('режим bb показывает сумму в больших блайндах', () => {
    render(<ChipStack amount={1000} bigBlind={200} displayMode="bb" />);
    expect(screen.getByText('5 ББ')).toBeInTheDocument();
  });

  it('рендерит фишки-картинки для разбивки суммы', () => {
    const { container } = render(<ChipStack amount={126} bigBlind={200} displayMode="chips" />);
    // 126 = 100(blue) + 25(cyan) + 1(white) → минимум 3 фишки
    expect(container.querySelectorAll('img').length).toBeGreaterThanOrEqual(3);
  });
});

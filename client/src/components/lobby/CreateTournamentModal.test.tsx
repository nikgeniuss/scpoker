import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CreateTournamentModal } from './CreateTournamentModal';
import type { CreateTournamentOptions } from '@poker-room/shared';

// Стартовый стек теперь задаётся в BB, а не в фишках — фактический startingStack (для сервера)
// вычисляется на клиенте как startingBigBlind × стек-в-BB (см. ROADMAP §10.19).
describe('<CreateTournamentModal /> — стартовый блайнд и стек в BB', () => {
  it('по умолчанию (25/50, 100bb) считает стек = 5000 и шлёт startingBigBlind=50', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByText('0.25 / 0.50')).toBeInTheDocument();
    expect(screen.getByText('= 50 фишек на старте')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit).toHaveBeenCalledOnce();
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(50);
    expect(opts.startingStack).toBe(5000);
  });

  it('переключение стартового блайнда на следующий уровень лестницы пересчитывает стек', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const blindRow = screen.getByText('Начальный блайнд').closest('div')!.parentElement!;
    fireEvent.click(within(blindRow).getByText('+')); // 25/50 → 50/100

    expect(screen.getByText('0.50 / 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(100);
    expect(opts.startingStack).toBe(10000); // 100 × 100bb
  });

  it('увеличение стека в BB пересчитывает фишки при том же блайнде', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const stackRow = screen.getByText('Стартовый стек, BB').closest('div')!.parentElement!;
    fireEvent.click(within(stackRow).getByText('+')); // 100 → 110

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(50);
    expect(opts.startingStack).toBe(5500); // 50 × 110
  });
});

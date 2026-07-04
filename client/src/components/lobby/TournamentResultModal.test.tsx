import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TournamentResultModal } from './TournamentResultModal';
import type { TournamentResultPayload } from '@poker-room/shared';

function makeResult(over: Partial<TournamentResultPayload> = {}): TournamentResultPayload {
  return {
    tournamentId: 't1',
    tournamentName: 'Ante Test MTT',
    place: 3,
    totalEntries: 12,
    isWinner: false,
    ...over,
  };
}

const noop = () => {};

describe('<TournamentResultModal />', () => {
  it('ничего не рендерит без результата', () => {
    render(<TournamentResultModal result={null} onClose={noop} onReEnter={noop} />);
    expect(screen.queryByText('Ante Test MTT')).not.toBeInTheDocument();
  });

  it('победа: показывает трофей, число участников и приз', () => {
    render(
      <TournamentResultModal
        result={makeResult({ isWinner: true, place: 1, prize: 10000 })}
        onClose={noop}
        onReEnter={noop}
      />,
    );
    expect(screen.getByText('Победа в турнире!')).toBeInTheDocument();
    expect(screen.getByText('Вы выиграли турнир из 12 участников')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('выбывание в призовых местах: место и приз', () => {
    render(
      <TournamentResultModal
        result={makeResult({ place: 3, totalEntries: 12, prize: 5000 })}
        onClose={noop}
        onReEnter={noop}
      />,
    );
    expect(screen.getByText('Турнир завершён')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('/12')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('выбывание без приза: показывает «без выплаты»', () => {
    render(<TournamentResultModal result={makeResult({ place: 8 })} onClose={noop} onReEnter={noop} />);
    expect(screen.getByText('Без выплаты в этот раз')).toBeInTheDocument();
  });

  it('кнопка закрытия вызывает onClose', () => {
    const onClose = vi.fn();
    render(<TournamentResultModal result={makeResult()} onClose={onClose} onReEnter={noop} />);
    fireEvent.click(screen.getByText('Понятно'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ре-энтри доступен (reEntryFee задан) — показывает кнопку «Зайти заново», клик вызывает onReEnter с tournamentId', () => {
    const onReEnter = vi.fn();
    render(
      <TournamentResultModal
        result={makeResult({ reEntryFee: 1500 })}
        onClose={noop}
        onReEnter={onReEnter}
      />,
    );
    const btn = screen.getByText('Зайти заново (за 15)');
    fireEvent.click(btn);
    expect(onReEnter).toHaveBeenCalledWith('t1');
  });

  it('ре-энтри недоступен (reEntryFee не задан) — кнопки нет', () => {
    render(<TournamentResultModal result={makeResult()} onClose={noop} onReEnter={noop} />);
    expect(screen.queryByText(/Зайти заново/)).not.toBeInTheDocument();
  });
});

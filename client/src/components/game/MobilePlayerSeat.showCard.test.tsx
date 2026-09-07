import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobilePlayerSeat } from './MobilePlayerSeat';
import type { PlayerView } from './PlayerSeat';

// Добровольный показ карт после раздачи (тап по карте → видна всем). Раньше карты героя рисовал
// ещё и отдельный fixed-блок в GameRoom — два набора накладывались друг на друга, и попасть по
// кликабельному было трудно (живой прогон 2026-09-02). Теперь кнопки — на самих картах героя.
const hero = (over: Partial<PlayerView> = {}): PlayerView & { country?: string } => ({
  id: 'me', username: 'Hero', chips: 1000, isFolded: false, currentBet: 0, position: 0,
  cards: [{ suit: 'hearts', rank: 'J' }, { suit: 'spades', rank: '9' }],
  ...over,
});

const baseProps = {
  isMe: true, isCurrent: false, isWinner: false, isDealer: false, isSmallBlind: false,
  isBigBlind: false, hasCardsInHand: true, showHand: true, faceStyle: 'classic',
  backStyle: 'classic', bigBlind: 100, displayMode: 'chips' as const,
};

describe('<MobilePlayerSeat /> — добровольный показ карт героя', () => {
  it('без окна показа карты героя не кнопки (дубля-кнопок нет)', () => {
    render(<MobilePlayerSeat {...baseProps} player={hero()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('в окне показа обе карты — кнопки, тап шлёт индекс', () => {
    const onShowCard = vi.fn();
    render(
      <MobilePlayerSeat {...baseProps} player={hero()} onShowCard={onShowCard} showCardPrompt="Показать карту сопернику" />,
    );

    expect(screen.getByText('Показать карту сопернику')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2); // ровно две — один набор карт, без наложения

    fireEvent.click(buttons[0]);
    expect(onShowCard).toHaveBeenCalledWith(0);
    fireEvent.click(buttons[1]);
    expect(onShowCard).toHaveBeenCalledWith(1);
  });

  it('уже показанная карта — кнопка заблокирована, повторный тап не шлёт', () => {
    const onShowCard = vi.fn();
    render(
      <MobilePlayerSeat {...baseProps} player={hero({ revealedCards: [1] })} onShowCard={onShowCard} showCardPrompt="Показать" />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
    fireEvent.click(buttons[1]);
    expect(onShowCard).not.toHaveBeenCalled();
  });

  it('сфолдивший герой тоже может показать карты (окно открыто)', () => {
    render(
      <MobilePlayerSeat
        {...baseProps}
        hasCardsInHand={false}
        player={hero({ isFolded: true })}
        onShowCard={vi.fn()}
        showCardPrompt="Показать"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

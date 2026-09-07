import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobilePlayerSeat } from './MobilePlayerSeat';
import { isBotId } from '@poker-room/shared';
import type { PlayerView } from './PlayerSeat';

// Админ-метка «кто бот»: вместо аватарки — белый кружок с красной «B». Гейт по isAdmin делает
// GameRoom (обычный игрок не должен отличать ботов от людей), компонент лишь рисует по флагу.
const player = (id: string): PlayerView & { country?: string } => ({
  id, username: 'Bot77', chips: 1000, cards: [], isFolded: false, currentBet: 0, position: 1,
});

const baseProps = {
  isMe: false, isCurrent: false, isWinner: false, isDealer: false, isSmallBlind: false,
  isBigBlind: false, hasCardsInHand: false, showHand: false, faceStyle: 'classic',
  backStyle: 'classic', bigBlind: 100, displayMode: 'chips' as const,
};

describe('isBotId (shared)', () => {
  it('узнаёт ботов по префиксу и не путает людей', () => {
    expect(isBotId('bot:fill-timofey96')).toBe(true);
    expect(isBotId('bot:tt-K5INF')).toBe(true);
    expect(isBotId('a2d8dd64-dfa1-4a5a-93c4-1351ed6f1020')).toBe(false);
  });
});

describe('<MobilePlayerSeat /> — админ-метка бота', () => {
  it('с isBotSeat рисует красную «B» на белом фоне вместо аватарки', () => {
    render(<MobilePlayerSeat {...baseProps} player={player('bot:tt-K5INF')} isBotSeat />);
    const badge = screen.getByText('B');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-red-600');
    expect(badge.parentElement!.className).toContain('bg-white');
  });

  it('без флага (обычный игрок смотрит на бота) метки нет', () => {
    render(<MobilePlayerSeat {...baseProps} player={player('bot:tt-K5INF')} />);
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('живой игрок у админа остаётся с обычной аватаркой', () => {
    render(<MobilePlayerSeat {...baseProps} player={player('a2d8dd64-dfa1')} isBotSeat={false} />);
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });
});

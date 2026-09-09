import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PlayerInfoPopup } from './PlayerInfoPopup';
import type { PlayerView } from './PlayerSeat';

// Платный HUD (ROADMAP §10.21.13): без подписки сервер не присылает VPIP/PFR соперника вовсе —
// приходит только число рук (hudLockedHands). Попап обязан показать заглушку и путь в магазин,
// а не «нет данных»: иначе платная фича выглядит как отсутствие статистики.

const basePlayer: PlayerView = {
  id: 'B',
  username: 'Bob',
  chips: 1000,
  cards: [],
  isActive: true,
  isFolded: false,
  currentBet: 0,
  position: 1,
  avatar: '',
  disconnected: false,
} as unknown as PlayerView;

function renderPopup(player: PlayerView) {
  return render(
    <MemoryRouter initialEntries={['/room/1']}>
      <Routes>
        <Route path="/room/1" element={<PlayerInfoPopup player={player} note="" onNoteChange={vi.fn()} onClose={vi.fn()} />} />
        <Route path="/shop" element={<div>SHOP_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlayerInfoPopup — HUD соперника', () => {
  it('открытый HUD показывает реальные VPIP/PFR', () => {
    renderPopup({ ...basePlayer, hudStats: { vpip: 24, pfr: 18, hands: 137 } });
    expect(screen.getByText('24%')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
  });

  it('заблокированный HUD: число рук видно, кнопка в магазин есть', () => {
    renderPopup({ ...basePlayer, hudLockedHands: 137 });
    expect(screen.getByText(/137/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /магазин/i })).toBeInTheDocument();
  });

  it('цифры под блюром — константы вёрстки, а не данные игрока', () => {
    // Настоящие VPIP/PFR соперника до клиента не доходят вовсе (гейт в сериализаторе), поэтому
    // у двух РАЗНЫХ игроков заглушка обязана быть одинаковой — иначе по ней что-то читалось бы.
    const { unmount } = renderPopup({ ...basePlayer, hudLockedHands: 137 });
    const first = screen.getByText(/VPIP/).parentElement!.parentElement!.textContent;
    unmount();

    renderPopup({ ...basePlayer, id: 'C', username: 'Carol', hudLockedHands: 42 });
    const second = screen.getByText(/VPIP/).parentElement!.parentElement!.textContent;
    expect(second).toBe(first);
  });

  it('кнопка ведёт в магазин', () => {
    renderPopup({ ...basePlayer, hudLockedHands: 137 });
    fireEvent.click(screen.getByRole('button', { name: /магазин/i }));
    expect(screen.getByText('SHOP_PAGE')).toBeInTheDocument();
  });

  it('без статистики вовсе — старое поведение «нет данных», без кнопки', () => {
    renderPopup(basePlayer);
    expect(screen.queryByRole('button', { name: /магазин/i })).not.toBeInTheDocument();
  });
});

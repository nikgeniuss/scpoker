import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AkProfile } from './AkProfile';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';

// AkProfile переиспользует Profile.tsx-функциональность (баланс/рейкбэк/меню/модалки) в AK-вёрстке —
// проверяем именно перенос данных и навигации, не пиксели.

function renderAkProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<AkProfile />} />
        <Route path="/wallet" element={<div>WALLET_PAGE</div>} />
        <Route path="/rakeback" element={<div>RAKEBACK_PAGE</div>} />
        <Route path="/pokercraft" element={<div>POKERCRAFT_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<AkProfile />', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'tok',
      user: { id: 'u1', username: 'Vasya', role: 'user', chips: 12345, publicId: 'AB12-CD34' },
      isAdmin: false,
    });
    useRakebackStore.setState({ totalPaid: 0, lifetimeRake: 0, tier: null, nextTier: null, history: [], loaded: false });
  });

  it('показывает ник, ID и баланс из useAuthStore/formatMoney', () => {
    renderAkProfile();
    expect(screen.getByText('Vasya')).toBeInTheDocument();
    expect(screen.getByText('ID: AB12-CD34')).toBeInTheDocument();
    expect(screen.getByText('123.45')).toBeInTheDocument();
  });

  it('показывает сумму рейкбэка из useRakebackStore', () => {
    useRakebackStore.setState({ totalPaid: 5000 });
    renderAkProfile();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('клик по «Пополнение»/«Вывод»/«Транзакции» ведёт на /wallet', () => {
    renderAkProfile();
    fireEvent.click(screen.getByText('Пополнение'));
    expect(screen.getByText('WALLET_PAGE')).toBeInTheDocument();
  });

  it('клик по карточке рейкбэка ведёт на /rakeback', () => {
    renderAkProfile();
    fireEvent.click(screen.getByText('Подробности'));
    expect(screen.getByText('RAKEBACK_PAGE')).toBeInTheDocument();
  });

  it('клик по пункту меню «История раздач» ведёт на /pokercraft', () => {
    renderAkProfile();
    fireEvent.click(screen.getByText('История раздач'));
    expect(screen.getByText('POKERCRAFT_PAGE')).toBeInTheDocument();
  });

  it('клик по «Настройки игры» открывает GameSettingsModal', () => {
    renderAkProfile();
    expect(screen.queryByText('Настройки Игры')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Настройки игры'));
    expect(screen.getByText('Настройки Игры')).toBeInTheDocument();
  });

  it('без пользователя — ничего не рендерит', () => {
    useAuthStore.setState({ token: null, user: null, isAdmin: false });
    const { container } = renderAkProfile();
    expect(container.textContent).toBe('');
  });
});

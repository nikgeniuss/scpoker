import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from './Profile';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import type { ProfileStats } from '../hooks/useProfileStats';

// Блок статистики профиля (ROADMAP §9.1): все четыре метрики реальные, приходят одним
// запросом /api/profile/stats. Хук подменяем — проверяем рендер и форматирование, не сеть.

const mockStats = vi.fn<() => { stats: ProfileStats | null; loading: boolean }>();
vi.mock('../hooks/useProfileStats', () => ({ useProfileStats: () => mockStats() }));

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Profile />
    </MemoryRouter>,
  );
}

// Значение плитки = текст под её подписью (обе строки лежат в одной карточке).
function tileValue(label: string): string {
  const card = screen.getByText(label).parentElement;
  return card?.lastElementChild?.textContent ?? '';
}

describe('<Profile /> — блок статистики', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'tok',
      user: { id: 'u1', username: 'Vasya', role: 'user', chips: 1000 },
      isAdmin: false,
    });
    useRakebackStore.setState({ enabled: false, tier: null, nextTier: null, loadMine: vi.fn() });
    mockStats.mockReturnValue({ stats: null, loading: true });
  });

  it('пока статистика не пришла — во всех плитках прочерк, а не нули', () => {
    renderProfile();
    expect(tileValue('Рук сыграно')).toBe('—');
    expect(tileValue('Побед')).toBe('—');
    expect(tileValue('ROI')).toBe('—');
    expect(tileValue('Часов за столом')).toBe('—');
  });

  it('руки и победы берутся из lifetime-итогов (один источник — расхождения быть не может)', () => {
    mockStats.mockReturnValue({ stats: { hands: 250, wins: 61, roiPercent: null, tableMinutes: 0 }, loading: false });
    renderProfile();
    expect(tileValue('Рук сыграно')).toBe('250');
    expect(tileValue('Побед')).toBe('61');
  });

  it('положительный ROI со знаком плюс, отрицательный — с минусом', () => {
    mockStats.mockReturnValue({ stats: { hands: 1, wins: 0, roiPercent: 25.46, tableMinutes: 0 }, loading: false });
    const { unmount } = renderProfile();
    expect(tileValue('ROI')).toBe('+25.5%');
    unmount();

    mockStats.mockReturnValue({ stats: { hands: 1, wins: 0, roiPercent: -12.34, tableMinutes: 0 }, loading: false });
    renderProfile();
    expect(tileValue('ROI')).toBe('-12.3%');
  });

  it('без турнирных входов ROI — прочерк, а не 0% (считать не из чего)', () => {
    mockStats.mockReturnValue({ stats: { hands: 10, wins: 3, roiPercent: null, tableMinutes: 0 }, loading: false });
    renderProfile();
    expect(tileValue('ROI')).toBe('—');
  });

  it('минуты за столом показываются часами', () => {
    mockStats.mockReturnValue({ stats: { hands: 0, wins: 0, roiPercent: null, tableMinutes: 90 }, loading: false });
    renderProfile();
    expect(tileValue('Часов за столом')).toBe('1.5');
  });
});

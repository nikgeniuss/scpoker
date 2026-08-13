import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClubMemberView } from './ClubMemberView';
import { useAuthStore } from '../../store/authStore';
import type { MyClub } from '../../store/clubStore';

// Экран участника (не владельца) — /club для тех, кто уже состоит в чужом клубе (ROADMAP: единая
// точка входа /club, до этого /my-club был owner-only и участник упирался в редирект на «/»).

const CLUB: MyClub = {
  id: 'club1',
  name: 'Kings Poker',
  ownerId: 'owner1',
  members: [
    { userId: 'owner1', username: 'Owner', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    { userId: 'me', username: 'Me', role: 'member', joinedAt: '2026-02-01T00:00:00.000Z' },
  ],
  inviteCode: 'ABCD1234',
  pendingRequests: [],
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderView(onRefresh = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/club']}>
      <Routes>
        <Route path="/club" element={<ClubMemberView club={CLUB} onRefresh={onRefresh} />} />
        <Route path="/" element={<div>HOME_PAGE</div>} />
        <Route path="/lobby" element={<div>LOBBY_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ClubMemberView />', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: { id: 'me', username: 'Me', role: 'user' }, isAdmin: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает название клуба, владельца и участников без кнопок управления', () => {
    renderView();
    expect(screen.getByText('Kings Poker')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('владелец')).toBeInTheDocument();
    // Нет кнопок кика/одобрения заявок — это read-only вид участника
    expect(screen.queryByTitle('Исключить')).not.toBeInTheDocument();
  });

  it('кнопка «Комнаты клуба» ведёт в лобби', async () => {
    renderView();
    fireEvent.click(screen.getByText('Комнаты клуба'));
    expect(await screen.findByText('LOBBY_PAGE')).toBeInTheDocument();
  });

  it('«Покинуть клуб» вызывает POST /leave и уводит на главную', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)),
    );
    const onRefresh = vi.fn();
    renderView(onRefresh);

    fireEvent.click(screen.getByText('Покинуть клуб'));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/clubs/club1/leave'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('HOME_PAGE')).toBeInTheDocument();
  });

  it('отмена confirm — запрос не отправляется', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderView();

    fireEvent.click(screen.getByText('Покинуть клуб'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

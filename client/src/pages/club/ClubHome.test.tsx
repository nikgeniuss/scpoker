import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClubHome } from './ClubHome';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';

// Точка входа /club (ROADMAP): раньше владелец-кнопка «Мой клуб» была видна только owner'ам,
// а участник чужого клуба вообще не имел экрана — клик по клуб-карточке на MainMenu уводил на
// /my-club, гейт RequireClubOwner редиректил не-владельца на «/» (тупик). /club чинит это,
// ветвясь по статусу. Каждый кейс — свой токен: useMyClub кеширует последний токен модульно
// (см. _lastToken в useMyClub.ts), разные токены гарантируют свежий fetch на каждый тест.

function mockFetchMy(response: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/clubs/my-request')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) } as Response);
      }
      if (url.includes('/clubs/open')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(response) } as Response);
    }),
  );
}

function renderClubHome() {
  return render(
    <MemoryRouter initialEntries={['/club']}>
      <Routes>
        <Route path="/club" element={<ClubHome />} />
        <Route path="/my-club" element={<div>MY_CLUB_ADMIN_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ClubHome /> — ветвление по статусу', () => {
  beforeEach(() => {
    // Иначе первый рендер следующего теста читает myClub/initialized, оставшиеся в сторе
    // от предыдущего кейса, пока свежий fetch ещё не разрешился (гонка с useMyClub).
    useClubStore.setState({ myClub: null, loading: false, initialized: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('владелец — редирект на /my-club', async () => {
    useAuthStore.setState({ token: 'token-owner', user: { id: 'me', username: 'Me', role: 'user' }, isAdmin: false });
    mockFetchMy({ id: 'club1', name: 'My Club', ownerId: 'me', members: [], inviteCode: 'X', pendingRequests: [], settings: {}, createdAt: '' });

    renderClubHome();

    expect(await screen.findByText('MY_CLUB_ADMIN_PAGE')).toBeInTheDocument();
  });

  it('участник (не владелец) — экран участника, без редиректа на /', async () => {
    useAuthStore.setState({ token: 'token-member', user: { id: 'me', username: 'Me', role: 'user' }, isAdmin: false });
    mockFetchMy({
      id: 'club1',
      name: 'Someone Else Club',
      ownerId: 'owner1',
      members: [{ userId: 'owner1', username: 'Owner', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }],
      inviteCode: 'X',
      pendingRequests: [],
      settings: {},
      createdAt: '',
    });

    renderClubHome();

    expect(await screen.findByText('Someone Else Club')).toBeInTheDocument();
    expect(screen.getByText('Покинуть клуб')).toBeInTheDocument();
  });

  it('нет клуба — экран browse (создать клуб / список открытых)', async () => {
    useAuthStore.setState({ token: 'token-none', user: { id: 'me', username: 'Me', role: 'user' }, isAdmin: false });
    mockFetchMy({ error: 'not-found' }, 404);

    renderClubHome();

    expect(await screen.findByText('Создать клуб')).toBeInTheDocument();
  });
});

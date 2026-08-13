import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TableInfoModal } from './TableInfoModal';
import { useAuthStore } from '../../store/authStore';
import type { TournamentStandings } from '@poker-room/shared';

// Секция «Турнир» в TableInfoModal (ROADMAP §10.19, 2026-07-05) — читает /rooms/:id (уже было) +
// новый /tournaments/:id/standings. Здесь проверяется только новая турнирная секция: рэнкинг,
// призовые, поздняя рег. Остальная (давно существующая) часть модалки тестами не покрыта — вне
// объёма этой задачи.

const ROOM = {
  id: 'room1',
  name: 'Test Room',
  description: '',
  format: 'nlh',
  smallBlind: 10,
  bigBlind: 20,
  createdBy: 'admin',
  currentPlayers: 2,
  maxPlayers: 6,
  status: 'playing',
  hasPassword: false,
  buyInMinBb: 20,
  buyInMaxBb: 100,
  turnDurationSec: 15,
  rake: { percent: 0, capBb: 0 },
};

const STANDINGS: TournamentStandings = {
  entries: [
    { userId: 'me', username: 'Me', chips: 3000, place: 1 },
    { userId: 'bob', username: 'Bob', chips: 1000, place: 2 },
  ],
  totalEntries: 3,
  playersRemaining: 2,
  prizePool: 4000,
  paidPlaces: 2,
  payout: { 1: 2600, 2: 1400 },
  lateRegClosesAt: Date.now() + 5 * 60_000,
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes('/standings')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(STANDINGS) } as Response);
    }
    if (url.includes('/winners')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(ROOM) } as Response);
  });
}

describe('<TableInfoModal /> — турнирная секция', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token' });
    vi.stubGlobal('fetch', mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('без tournamentId — секция «Турнир» не рендерится', async () => {
    render(
      <TableInfoModal open roomId="room1" myChips={1000} myCurrentBet={0} displayMode="chips" onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('Test Room')).toBeInTheDocument());
    expect(screen.queryByText('Турнир')).not.toBeInTheDocument();
  });

  it('с tournamentId — показывает моё место, оставшихся игроков, призовой фонд, выплаты и обратный отсчёт поздней рег.', async () => {
    render(
      <TableInfoModal
        open
        roomId="room1"
        myChips={3000}
        myCurrentBet={0}
        displayMode="chips"
        tournamentId="t1"
        myId="me"
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Турнир')).toBeInTheDocument());

    expect(screen.getByText('1 из 2')).toBeInTheDocument(); // моё место
    expect(screen.getByText('2 из 3')).toBeInTheDocument(); // осталось игроков
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/\(вы\)/)).toBeInTheDocument(); // моя строка в лидерборде помечена
    expect(screen.getByText('До конца поздней рег.')).toBeInTheDocument();
  });

  it('lateRegClosesAt в прошлом — строка обратного отсчёта не показывается', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/standings')) {
          const past: TournamentStandings = { ...STANDINGS, lateRegClosesAt: Date.now() - 1000 };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(past) } as Response);
        }
        if (url.includes('/winners')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(ROOM) } as Response);
      }),
    );
    render(
      <TableInfoModal
        open
        roomId="room1"
        myChips={3000}
        myCurrentBet={0}
        displayMode="chips"
        tournamentId="t1"
        myId="me"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('Турнир')).toBeInTheDocument());
    expect(screen.queryByText('До конца поздней рег.')).not.toBeInTheDocument();
  });
});

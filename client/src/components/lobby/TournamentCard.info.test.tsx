import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TournamentCard } from './TournamentCard';
import { useAuthStore } from '../../store/authStore';
import type { TournamentInfo } from '@poker-room/shared';

// Кнопка «i» на карточке турнира (§10.19): структура доступна при ЛЮБОМ статусе — до этого
// подробности открывались только у завершённых турниров, и игрок перед регистрацией не мог
// посмотреть ни стек, ни блайнды, ни разбивку призовых.

const BASE: TournamentInfo = {
  id: 't1',
  name: 'Info Test Tournament',
  type: 'sng',
  format: 'nlh',
  status: 'registering',
  buyIn: 1000,
  startingStack: 1500,
  startingBigBlind: 20,
  tableSize: 6,
  blindSpeed: 'regular',
  levelUpMinutes: 10,
  prizePool: 2000,
  entries: [],
  tableIds: [],
  lateRegMinutes: 0,
  itmPercent: 100,
  payoutMode: 'itm',
  reEntryEnabled: false,
  bountyEnabled: false,
  fillWithBots: false,
  createdBy: 'admin1',
  createdAt: Date.now(),
};

function renderCard(trn: Partial<TournamentInfo> = {}) {
  return render(
    <TournamentCard
      tournament={{ ...BASE, ...trn }}
      myId="u1"
      isAdmin={false}
      onRegister={() => {}}
      onUnregister={() => {}}
      onForceStart={() => {}}
      onCancel={() => {}}
      onRemove={() => {}}
      onGoToTable={() => {}}
      onAddBots={() => {}}
      onRedeemPromo={async () => ({ ok: true })}
    />,
  );
}

describe('<TournamentCard /> — кнопка информации', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: { id: 'u1', username: 'Me', role: 'player' }, isAdmin: false });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ prizePool: 2000, paidPlaces: 2, payout: { 1: 1300, 2: 700 } }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('у турнира, открытого для регистрации, кнопка есть и открывает структуру', async () => {
    renderCard();
    fireEvent.click(screen.getByLabelText('Информация о турнире'));

    expect(await screen.findByText('Структура')).toBeInTheDocument();
    expect(screen.getByText('Стартовый стек')).toBeInTheDocument();
    // Разбивка приходит с сервера — на клиенте её не пересчитываем.
    await waitFor(() => expect(screen.getByText('1 место')).toBeInTheDocument());
  });

  it('у идущего турнира структура тоже доступна', async () => {
    renderCard({ status: 'running' });
    fireEvent.click(screen.getByLabelText('Информация о турнире'));
    expect(await screen.findByText('Структура')).toBeInTheDocument();
  });

  it('фриролл показан как бесплатный вход', async () => {
    renderCard({ buyIn: 0 });
    fireEvent.click(screen.getByLabelText('Информация о турнире'));
    // Модалка рендерится порталом, поэтому проверяем сам найденный узел, а не вхождение в
    // document (портал прошлого теста может остаться отсоединённым и путать toBeInTheDocument).
    const freeroll = await screen.findByText(/Бесплатно/);
    expect(freeroll.textContent).toBe('Бесплатно');
  });
});

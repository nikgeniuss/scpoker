import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TournamentCard } from './TournamentCard';
import type { TournamentInfo } from '@poker-room/shared';

// Клик по завершённой/отменённой карточке — полная сводка (TournamentDetailsModal), пока она ещё
// в лобби (автоудаление через 30 минут, TournamentManager.scheduleAutoRemove).

const BASE: TournamentInfo = {
  id: 't1',
  name: 'Details Test Tournament',
  type: 'sng',
  format: 'nlh',
  status: 'registering',
  buyIn: 1000,
  startingStack: 1000,
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

function renderCard(tournament: TournamentInfo) {
  return render(
    <TournamentCard
      tournament={tournament}
      myId={null}
      isAdmin={false}
      onRegister={vi.fn()}
      onUnregister={vi.fn()}
      onForceStart={vi.fn()}
      onCancel={vi.fn()}
      onGoToTable={vi.fn()}
      onAddBots={vi.fn()}
      onRedeemPromo={vi.fn().mockResolvedValue({ ok: true })}
    />,
  );
}

describe('<TournamentCard /> — клик на завершённую/отменённую карточку открывает детали', () => {
  it('finished: клик открывает модалку с полными результатами (не только топ-3)', () => {
    const entries: TournamentInfo['entries'] = Array.from({ length: 5 }, (_, i) => ({
      userId: 'u' + i,
      username: 'Player' + i,
      status: 'eliminated',
      finishPlace: i + 1,
      prize: i === 0 ? 2000 : undefined,
    }));
    renderCard({ ...BASE, status: 'finished', entries });

    // На карточке виден только топ-3 (уже существующее поведение)
    expect(screen.queryByText(/Player4/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Details Test Tournament'));

    expect(screen.getByText('Итоги турнира')).toBeInTheDocument();
    // Полный список — 4-е и 5-е место тоже видны в модалке
    expect(screen.getByText(/4\. Player3/)).toBeInTheDocument();
    expect(screen.getByText(/5\. Player4/)).toBeInTheDocument();
  });

  it('cancelled: клик открывает модалку с пометкой о возврате бай-инов и списком участников, без призов', () => {
    const entries: TournamentInfo['entries'] = [
      { userId: 'a', username: 'Alice', status: 'registered' },
      { userId: 'b', username: 'Bob', status: 'registered' },
    ];
    renderCard({ ...BASE, status: 'cancelled', entries });

    fireEvent.click(screen.getByText('Details Test Tournament'));

    expect(screen.getByText('Турнир отменён')).toBeInTheDocument();
    expect(screen.getByText(/возвращены/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('registering/running: клик по карточке ничего не открывает', () => {
    renderCard({ ...BASE, status: 'registering' });
    fireEvent.click(screen.getByText('Details Test Tournament'));
    expect(screen.queryByText('Итоги турнира')).not.toBeInTheDocument();
  });

  it('закрытие модалки кнопкой убирает её из DOM', () => {
    const entries: TournamentInfo['entries'] = [
      { userId: 'a', username: 'Alice', status: 'eliminated', finishPlace: 1, prize: 2000 },
    ];
    renderCard({ ...BASE, status: 'finished', entries });
    fireEvent.click(screen.getByText('Details Test Tournament'));
    expect(screen.getByText('Итоги турнира')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Закрыть'));
    expect(screen.queryByText('Итоги турнира')).not.toBeInTheDocument();
  });
});

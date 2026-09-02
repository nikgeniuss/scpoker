import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TournamentCard } from './TournamentCard';
import type { TournamentInfo } from '@poker-room/shared';

// Расписание старта (ROADMAP §10.19, 2026-07-07): до regOpensAt кнопка Register скрыта, вместо неё —
// сообщение с временем открытия; scheduledStartAt — информационный чип «Старт: …».

const BASE: TournamentInfo = {
  id: 't1',
  name: 'Scheduled Tournament',
  type: 'sng',
  format: 'nlh',
  status: 'registering',
  buyIn: 0,
  startingStack: 1000,
  startingBigBlind: 20,
  tableSize: 6,
  blindSpeed: 'regular',
  levelUpMinutes: 10,
  prizePool: 0,
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

describe('<TournamentCard /> — расписание старта', () => {
  it('до regOpensAt кнопка регистрации скрыта, показано время открытия', () => {
    const regOpensAt = Date.now() + 60 * 60_000;
    renderCard({ ...BASE, regOpensAt });
    expect(screen.queryByText('Зарегистрироваться')).not.toBeInTheDocument();
    expect(screen.getByText(/Регистрация откроется:/)).toBeInTheDocument();
  });

  it('после regOpensAt кнопка регистрации доступна как обычно', () => {
    const regOpensAt = Date.now() - 1000;
    renderCard({ ...BASE, regOpensAt });
    expect(screen.getByText('Зарегистрироваться')).toBeInTheDocument();
    expect(screen.queryByText(/Регистрация откроется:/)).not.toBeInTheDocument();
  });

  it('scheduledStartAt показывает информационный чип со временем старта', () => {
    const scheduledStartAt = Date.now() + 2 * 60 * 60_000;
    renderCard({ ...BASE, scheduledStartAt });
    expect(screen.getByText(/Старт:/)).toBeInTheDocument();
  });

  it('без regOpensAt/scheduledStartAt — старое поведение, никаких чипов расписания', () => {
    renderCard(BASE);
    expect(screen.getByText('Зарегистрироваться')).toBeInTheDocument();
    expect(screen.queryByText(/Регистрация откроется:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Старт:/)).not.toBeInTheDocument();
  });
});

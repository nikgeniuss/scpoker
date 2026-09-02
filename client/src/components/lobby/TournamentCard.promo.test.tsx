import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TournamentCard } from './TournamentCard';
import type { TournamentInfo } from '@poker-room/shared';

// Промокод на бесплатный вход (2026-08-27): форма «Активировать промо» на карточке турнира +
// видимость самого кода админу, создавшему турнир (обычным игрокам сервер его не отдаёт вовсе,
// см. tournaments.routes.ts stripPromoCode — тут проверяем только клиентское поведение по факту
// наличия/отсутствия trn.promoCode в пропсах).

const BASE: TournamentInfo = {
  id: 't1',
  name: 'Promo Tournament',
  type: 'sng',
  format: 'nlh',
  status: 'registering',
  buyIn: 1000,
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

function renderCard(tournament: TournamentInfo, overrides: Partial<Parameters<typeof TournamentCard>[0]> = {}) {
  const onRedeemPromo = vi.fn().mockResolvedValue({ ok: true });
  render(
    <TournamentCard
      tournament={tournament}
      myId={null}
      isAdmin={false}
      onRegister={vi.fn()}
      onUnregister={vi.fn()}
      onForceStart={vi.fn()}
      onCancel={vi.fn()}
      onRemove={vi.fn()}
      onGoToTable={vi.fn()}
      onAddBots={vi.fn()}
      onRedeemPromo={onRedeemPromo}
      {...overrides}
    />,
  );
  return { onRedeemPromo };
}

describe('<TournamentCard /> — промокод', () => {
  it('показывает «Есть промокод?», раскрывает форму, вызывает onRedeemPromo с введённым кодом', async () => {
    const { onRedeemPromo } = renderCard(BASE);

    fireEvent.click(screen.getByText('Есть промокод?'));
    const input = screen.getByPlaceholderText('Промокод');
    fireEvent.change(input, { target: { value: 'promo-7f3k' } });
    fireEvent.click(screen.getByText('Активировать'));

    expect(onRedeemPromo).toHaveBeenCalledWith('promo-7f3k');
  });

  it('после успешного погашения форма сворачивается обратно', async () => {
    renderCard(BASE);

    fireEvent.click(screen.getByText('Есть промокод?'));
    fireEvent.change(screen.getByPlaceholderText('Промокод'), { target: { value: 'CODE1' } });
    fireEvent.click(screen.getByText('Активировать'));

    await vi.waitFor(() => {
      expect(screen.queryByPlaceholderText('Промокод')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Есть промокод?')).toBeInTheDocument();
  });

  it('уже зарегистрированному игроку форма промо не показывается', () => {
    renderCard({ ...BASE, entries: [{ userId: 'me', username: 'Me', status: 'registered' }] }, { myId: 'me' });
    expect(screen.queryByText('Есть промокод?')).not.toBeInTheDocument();
  });

  it('обычный игрок не видит код турнира, даже если он есть в данных', () => {
    renderCard({ ...BASE, promoCode: 'PROMO-SECRET' }, { isAdmin: false });
    expect(screen.queryByText('PROMO-SECRET')).not.toBeInTheDocument();
  });

  it('админ видит код турнира как копируемый чип', () => {
    renderCard({ ...BASE, promoCode: 'PROMO-SECRET' }, { isAdmin: true });
    expect(screen.getByText('PROMO-SECRET')).toBeInTheDocument();
  });
});

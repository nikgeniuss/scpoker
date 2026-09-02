import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TournamentCard } from './TournamentCard';
import type { TournamentInfo, TournamentStatus } from '@poker-room/shared';

// Ручная уборка завершённого турнира из лобби (ROADMAP §10.19): автоудаление через 30 минут есть,
// но админу нужна возможность убрать тестовый турнир сразу. Кнопка — только у админа и только на
// архивных статусах: registering/running сервер удалять отказывается (там живые бай-ины).

const BASE: TournamentInfo = {
  id: 't1',
  name: 'Remove Test Tournament',
  type: 'sng',
  format: 'nlh',
  status: 'finished',
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

function renderCard(status: TournamentStatus, isAdmin: boolean, onRemove = vi.fn()) {
  render(
    <TournamentCard
      tournament={{ ...BASE, status }}
      myId={null}
      isAdmin={isAdmin}
      onRegister={vi.fn()}
      onUnregister={vi.fn()}
      onForceStart={vi.fn()}
      onCancel={vi.fn()}
      onRemove={onRemove}
      onGoToTable={vi.fn()}
      onAddBots={vi.fn()}
      onRedeemPromo={vi.fn().mockResolvedValue({ ok: true })}
    />,
  );
  return onRemove;
}

describe('TournamentCard — кнопка «Убрать из списка»', () => {
  it('админ видит кнопку на завершённом турнире и она вызывает обработчик', () => {
    const onRemove = renderCard('finished', true);
    const button = screen.getByText('Убрать из списка');

    fireEvent.click(button);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('на отменённом турнире кнопка тоже есть', () => {
    renderCard('cancelled', true);
    expect(screen.getByText('Убрать из списка')).toBeTruthy();
  });

  it('обычный игрок кнопки не видит', () => {
    renderCard('finished', false);
    expect(screen.queryByText('Убрать из списка')).toBeNull();
  });

  it('на идущем турнире кнопки нет даже у админа — сервер такое удаление отклоняет', () => {
    renderCard('running', true);
    expect(screen.queryByText('Убрать из списка')).toBeNull();
  });

  it('на открытом для регистрации кнопки нет — там живые бай-ины', () => {
    renderCard('registering', true);
    expect(screen.queryByText('Убрать из списка')).toBeNull();
  });
});

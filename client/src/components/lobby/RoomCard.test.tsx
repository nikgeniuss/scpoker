import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomCard } from './RoomCard';
import type { RoomInfo } from '@poker-room/shared';

function makeRoom(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    id: 'r1',
    name: 'High Stakes',
    description: '',
    smallBlind: 100,
    bigBlind: 200,
    maxPlayers: 6,
    currentPlayers: 1,
    hasPassword: false,
    status: 'waiting',
    createdBy: 'alice',
    playerIds: ['u1'],
    players: [{ id: 'u1', username: 'alice', avatar: '' }],
    turnDurationSec: 30,
    buyInMinBb: 40,
    buyInMaxBb: 200,
    timebank: { enabled: false } as RoomInfo['timebank'],
    waitlistIds: [],
    format: 'nlh',
    rake: { percent: 0, capBb: 0 },
    straddleEnabled: false,
    bombPotEnabled: false,
    doubleBoardEnabled: false,
    rimtEnabled: false,
    evCashoutEnabled: false,
    noTurnNoShowEnabled: false,
    antiCollusionEnabled: false,
    ...over,
  };
}

const noop = () => {};

describe('<RoomCard />', () => {
  it('показывает блайнды в заголовке и название стола', () => {
    render(
      <RoomCard room={makeRoom()} imIn={false} myQueuePos={0} onJoin={noop} onQueue={noop} onLeaveQueue={noop} />,
    );
    expect(screen.getByText('$1/$2')).toBeInTheDocument();
    expect(screen.getByText('High Stakes')).toBeInTheDocument();
  });

  it('рейк выключен (percent=0) — бейдж «Рейк» не показывается', () => {
    render(
      <RoomCard room={makeRoom()} imIn={false} myQueuePos={0} onJoin={noop} onQueue={noop} onLeaveQueue={noop} />,
    );
    expect(screen.queryByText('Рейк')).not.toBeInTheDocument();
  });

  it('рейк включён — показывается % в карточке', () => {
    render(
      <RoomCard
        room={makeRoom({ rake: { percent: 5, capBb: 3 } })}
        imIn={false}
        myQueuePos={0}
        onJoin={noop}
        onQueue={noop}
        onLeaveQueue={noop}
      />,
    );
    expect(screen.getByText('Рейк')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('свободный стол: кнопка «Присоединиться» вызывает onJoin', () => {
    const onJoin = vi.fn();
    render(
      <RoomCard room={makeRoom()} imIn={false} myQueuePos={0} onJoin={onJoin} onQueue={noop} onLeaveQueue={noop} />,
    );
    fireEvent.click(screen.getByText('Присоединиться'));
    expect(onJoin).toHaveBeenCalledOnce();
  });

  it('я в комнате: бейдж «Вы здесь» и кнопка «Вернуться»', () => {
    render(
      <RoomCard room={makeRoom()} imIn={true} myQueuePos={0} onJoin={noop} onQueue={noop} onLeaveQueue={noop} />,
    );
    expect(screen.getByText('Вы здесь')).toBeInTheDocument();
    expect(screen.getByText('Вернуться')).toBeInTheDocument();
  });

  it('полный стол без очереди: кнопка «Занять очередь» вызывает onQueue', () => {
    const onQueue = vi.fn();
    render(
      <RoomCard
        room={makeRoom({ currentPlayers: 6, maxPlayers: 6 })}
        imIn={false}
        myQueuePos={0}
        onJoin={noop}
        onQueue={onQueue}
        onLeaveQueue={noop}
      />,
    );
    fireEvent.click(screen.getByText(/Занять очередь/));
    expect(onQueue).toHaveBeenCalledOnce();
  });

  it('я в очереди на полный стол: показывает позицию и кнопку выхода', () => {
    const onLeaveQueue = vi.fn();
    render(
      <RoomCard
        room={makeRoom({ currentPlayers: 6, maxPlayers: 6, waitlistIds: ['a', 'b'] })}
        imIn={false}
        myQueuePos={2}
        onJoin={noop}
        onQueue={noop}
        onLeaveQueue={onLeaveQueue}
      />,
    );
    expect(screen.getByText(/В очереди: 2-й/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Выйти'));
    expect(onLeaveQueue).toHaveBeenCalledOnce();
  });
});

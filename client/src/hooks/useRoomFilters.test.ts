import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoomFilters } from './useRoomFilters';
import type { RoomInfo } from '@poker-room/shared';

function makeRoom(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    id: 'r1',
    name: 'Table',
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

describe('useRoomFilters', () => {
  it('без фильтров отдаёт все комнаты', () => {
    const rooms = [makeRoom({ id: 'a' }), makeRoom({ id: 'b' })];
    const { result } = renderHook(() => useRoomFilters(rooms, 'u1'));
    expect(result.current.filtered).toHaveLength(2);
    expect(result.current.tableCount).toBe(2);
  });

  it('поиск фильтрует по названию и автору (case-insensitive)', () => {
    const rooms = [
      makeRoom({ id: 'a', name: 'High Stakes', createdBy: 'bob' }),
      makeRoom({ id: 'b', name: 'Micro', createdBy: 'carol' }),
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, null));
    act(() => result.current.setSearch('high'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['a']);
    act(() => result.current.setSearch('carol'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['b']);
  });

  it('myOnly оставляет только комнаты с моим id', () => {
    const rooms = [
      makeRoom({ id: 'a', playerIds: ['u1'] }),
      makeRoom({ id: 'b', playerIds: ['u2'] }),
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, 'u1'));
    act(() => result.current.setMyOnly(true));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['a']);
  });

  it('waitingOnly отсекает играющие столы', () => {
    const rooms = [
      makeRoom({ id: 'a', status: 'waiting' }),
      makeRoom({ id: 'b', status: 'playing' }),
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, null));
    act(() => result.current.setWaitingOnly(true));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['a']);
  });

  it('hideUnavailable прячет полные/играющие, но оставляет те, где я сижу', () => {
    const rooms = [
      makeRoom({ id: 'full', currentPlayers: 6, maxPlayers: 6, playerIds: ['x'] }),
      makeRoom({ id: 'playing', status: 'playing', playerIds: ['x'] }),
      makeRoom({ id: 'mine-full', currentPlayers: 6, maxPlayers: 6, playerIds: ['u1'] }),
      makeRoom({ id: 'open', currentPlayers: 1, maxPlayers: 6, playerIds: ['x'] }),
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, 'u1'));
    act(() => result.current.setHideUnavailable(true));
    expect(result.current.filtered.map((r) => r.id).sort()).toEqual(['mine-full', 'open']);
  });

  it('таб формата фильтрует по room.format', () => {
    const rooms = [makeRoom({ id: 'nl' }), makeRoom({ id: 'sd', format: 'shortdeck' })];
    const { result } = renderHook(() => useRoomFilters(rooms, null));
    // Шорт-дэк таб — только sd
    act(() => result.current.setFormatTab('shortdeck'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['sd']);
    // NLH таб — только nl
    act(() => result.current.setFormatTab('nlh'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['nl']);
    // Все
    act(() => result.current.setFormatTab('all'));
    expect(result.current.filtered.map((r) => r.id).sort()).toEqual(['nl', 'sd']);
  });

  it('blindPreset фильтрует по диапазону bigBlind', () => {
    const rooms = [
      makeRoom({ id: 'micro',  bigBlind: 2,    smallBlind: 1    }), // 0.02 BB
      makeRoom({ id: 'low',    bigBlind: 50,   smallBlind: 25   }), // 0.50 BB
      makeRoom({ id: 'medium', bigBlind: 200,  smallBlind: 100  }), // 2.00 BB
      makeRoom({ id: 'high',   bigBlind: 5000, smallBlind: 2500 }), // 50.00 BB
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, null));
    act(() => result.current.setBlindPreset('micro'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['micro']);
    act(() => result.current.setBlindPreset('low'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['low']);
    act(() => result.current.setBlindPreset('medium'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['medium']);
    act(() => result.current.setBlindPreset('high'));
    expect(result.current.filtered.map((r) => r.id)).toEqual(['high']);
    act(() => result.current.setBlindPreset('all'));
    expect(result.current.filtered).toHaveLength(4);
  });

  it('счётчики: myRoomsCount и onlineCount (уникальные игроки)', () => {
    const rooms = [
      makeRoom({ id: 'a', playerIds: ['u1', 'u2'] }),
      makeRoom({ id: 'b', playerIds: ['u2', 'u3'] }),
    ];
    const { result } = renderHook(() => useRoomFilters(rooms, 'u1'));
    expect(result.current.myRoomsCount).toBe(1);
    expect(result.current.onlineCount).toBe(3); // u1,u2,u3 уникальны
  });
});

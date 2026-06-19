import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import type { RoomInfo } from '@poker-room/shared';

// Флоу входа за стол: приватная → пароль → бай-ин; открытая → сразу бай-ин.
// Реконнект к своей комнате идёт без модалок. Вынесено из Lobby (ROADMAP §9.3-E).
export interface PendingJoin {
  room: RoomInfo;
  stage: 'password' | 'buyin';
  password?: string;
  queue?: boolean; // true — вступление в очередь на полный стол (а не обычная посадка)
}

export function useJoinFlow(myId: string | null) {
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);

  const handleJoin = (room: RoomInfo) => {
    const imIn = !!myId && room.playerIds.includes(myId);
    if (imIn) {
      // Реконнект к своей комнате — без проверок и без бай-ина (canJoinRoom пропустит)
      getSocket().emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: room.id });
      return;
    }
    if (room.currentPlayers >= room.maxPlayers) {
      toast.error('Комната заполнена');
      return;
    }
    // Late entry: если комната в playing — открываем BuyInModal как обычно.
    // Приватная: сначала пароль, потом бай-ин. Открытая: сразу бай-ин.
    if (room.hasPassword) {
      setPendingJoin({ room, stage: 'password' });
    } else {
      setPendingJoin({ room, stage: 'buyin' });
    }
  };

  // Встать в очередь на полный стол: тот же флоу (пароль → бай-ин), но с флагом queue.
  const handleQueue = (room: RoomInfo) => {
    const imIn = !!myId && room.playerIds.includes(myId);
    if (imIn) return; // уже за столом
    if (room.hasPassword) {
      setPendingJoin({ room, stage: 'password', queue: true });
    } else {
      setPendingJoin({ room, stage: 'buyin', queue: true });
    }
  };

  const handleLeaveQueue = (room: RoomInfo) => {
    getSocket().emit(SOCKET_EVENTS.LEAVE_WAITLIST, { roomId: room.id });
  };

  const handlePasswordSubmit = (password: string) => {
    if (!pendingJoin || pendingJoin.stage !== 'password') return;
    setPendingJoin({ room: pendingJoin.room, stage: 'buyin', password, queue: pendingJoin.queue });
  };

  const handleBuyInSubmit = (amount: number) => {
    if (!pendingJoin || pendingJoin.stage !== 'buyin') return;
    const event = pendingJoin.queue ? SOCKET_EVENTS.JOIN_WAITLIST : SOCKET_EVENTS.JOIN_ROOM;
    getSocket().emit(event, {
      roomId: pendingJoin.room.id,
      password: pendingJoin.password,
      buyInAmount: amount,
    });
    if (pendingJoin.queue) toast.success('Вы встали в очередь');
    setPendingJoin(null);
  };

  // Стабильная ссылка — используется как onJoinDenied-колбэк в useLobbyData (deps).
  const reset = useCallback(() => setPendingJoin(null), []);

  return { pendingJoin, handleJoin, handleQueue, handleLeaveQueue, handlePasswordSubmit, handleBuyInSubmit, reset };
}

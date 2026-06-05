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

  const handlePasswordSubmit = (password: string) => {
    if (!pendingJoin || pendingJoin.stage !== 'password') return;
    setPendingJoin({ room: pendingJoin.room, stage: 'buyin', password });
  };

  const handleBuyInSubmit = (amount: number) => {
    if (!pendingJoin || pendingJoin.stage !== 'buyin') return;
    getSocket().emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: pendingJoin.room.id,
      password: pendingJoin.password,
      buyInAmount: amount,
    });
    setPendingJoin(null);
  };

  // Стабильная ссылка — используется как onJoinDenied-колбэк в useLobbyData (deps).
  const reset = useCallback(() => setPendingJoin(null), []);

  return { pendingJoin, handleJoin, handlePasswordSubmit, handleBuyInSubmit, reset };
}

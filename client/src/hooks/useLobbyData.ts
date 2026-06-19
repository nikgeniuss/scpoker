import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import type { RoomInfo, CreateRoomOptions as CreateOptions } from '@poker-room/shared';
import { denyMessage } from '../config/denyMessages';

// Транспорт лобби: подписки на список комнат + навигация при create/join + эмиттер создания.
// `?create=true` в URL открывает форму создания (deep-link из других экранов).
// Вынесено из Lobby (ROADMAP §9.3-E). Словарь joinDenied — общий config/denyMessages.ts (§9.3-F).

export function useLobbyData(onJoinDenied: () => void) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const socket = getSocket();

    const onRoomList = (list: RoomInfo[]) => setRooms(list);
    const onRoomCreated = ({ roomId }: { roomId: string }) => navigate('/game/' + roomId);
    const onRoomJoined = ({ roomId }: { roomId: string }) => navigate('/game/' + roomId);
    const onJoinDeniedEvt = ({ reason, retryAfterSec }: { reason: string; retryAfterSec?: number }) => {
      toast.error(denyMessage(reason, 'Не удалось войти', retryAfterSec));
      onJoinDenied();
    };
    const onError = ({ message }: { message: string }) => toast.error(message);

    socket.on(SOCKET_EVENTS.ROOM_LIST, onRoomList);
    socket.on(SOCKET_EVENTS.ROOM_CREATED, onRoomCreated);
    socket.on(SOCKET_EVENTS.ROOM_JOINED, onRoomJoined);
    socket.on(SOCKET_EVENTS.JOIN_DENIED, onJoinDeniedEvt);
    socket.on(SOCKET_EVENTS.ERROR, onError);
    socket.emit(SOCKET_EVENTS.LOBBY_SUBSCRIBE);

    return () => {
      socket.emit(SOCKET_EVENTS.LOBBY_UNSUBSCRIBE);
      socket.off(SOCKET_EVENTS.ROOM_LIST, onRoomList);
      socket.off(SOCKET_EVENTS.ROOM_CREATED, onRoomCreated);
      socket.off(SOCKET_EVENTS.ROOM_JOINED, onRoomJoined);
      socket.off(SOCKET_EVENTS.JOIN_DENIED, onJoinDeniedEvt);
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, [navigate, onJoinDenied]);

  const createRoom = (opts: CreateOptions) => {
    getSocket().emit(SOCKET_EVENTS.CREATE_ROOM, opts);
    setShowCreate(false);
  };

  return { rooms, showCreate, setShowCreate, createRoom };
}

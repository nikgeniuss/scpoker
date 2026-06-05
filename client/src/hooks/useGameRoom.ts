import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import type { GameState } from '@poker-room/shared';
import type { CardData } from '../components/game/Card';
import { denyMessage } from '../config/denyMessages';

// Транспортный слой стола: подписки на gameUpdate/winner/countdown/joinDenied/error,
// реджойн + запрос состояния при входе, эмиттеры действий/выхода/эмодзи.
// Карты соперников приходят с сервера per-socket (§0.1) — клиент только отображает.
// Вынесено из GameRoom (ROADMAP §9.3-E). Словарь joinDenied — общий config/denyMessages.ts (§9.3-F).

export interface GameRoomTransport {
  state: GameState | null;
  winners: string[] | null;
  winningCards: CardData[];
  countdownEndsAt: number | null;
  sendAction: (action: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) => void;
  leave: () => void;
  sendEmoji: (emoji: string) => void;
}

export function useGameRoom(roomId: string | undefined): GameRoomTransport {
  const navigate = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [winners, setWinners] = useState<string[] | null>(null);
  const [winningCards, setWinningCards] = useState<CardData[]>([]);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onUpdate = (s: GameState) => {
      setState(s);
      if (s.phase !== 'showdown') {
        setWinners(null);
        setWinningCards([]);
      }
    };
    const onWinner = ({
      winners,
      winningCards,
    }: {
      winners: string[];
      winningCards?: CardData[];
    }) => {
      setWinners(winners);
      setWinningCards(winningCards ?? []);
    };
    const onCountdown = ({ endsAt }: { endsAt: number | null }) => setCountdownEndsAt(endsAt);
    const onJoinDenied = ({ reason }: { reason: string }) => {
      toast.error(denyMessage(reason, 'Доступ закрыт: ' + reason));
      navigate('/lobby');
    };
    const onError = ({ message }: { message: string }) => toast.error(message);

    socket.on(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
    socket.on(SOCKET_EVENTS.GAME_WINNER, onWinner);
    socket.on(SOCKET_EVENTS.START_COUNTDOWN, onCountdown);
    socket.on(SOCKET_EVENTS.JOIN_DENIED, onJoinDenied);
    socket.on(SOCKET_EVENTS.ERROR, onError);

    // Реджойн + запрос актуального состояния (страховка от reload и для входа после reload)
    if (roomId) {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });
      socket.emit(SOCKET_EVENTS.REQUEST_GAME_STATE, { roomId });
    }

    return () => {
      socket.off(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
      socket.off(SOCKET_EVENTS.GAME_WINNER, onWinner);
      socket.off(SOCKET_EVENTS.START_COUNTDOWN, onCountdown);
      socket.off(SOCKET_EVENTS.JOIN_DENIED, onJoinDenied);
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, [navigate, roomId]);

  const sendAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.PLAYER_ACTION, { roomId, action, amount });
  };

  const leave = () => {
    if (roomId) getSocket().emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId });
    navigate('/lobby');
  };

  const sendEmoji = (emoji: string) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.SEND_EMOJI, { roomId, emoji });
  };

  return { state, winners, winningCards, countdownEndsAt, sendAction, leave, sendEmoji };
}

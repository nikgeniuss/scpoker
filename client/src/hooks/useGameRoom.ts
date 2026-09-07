import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import type { GameState } from '@poker-room/shared';
import type { CardData } from '../components/game/Card';
import { denyMessage } from '../config/denyMessages';
import { useTablesStore } from '../store/tablesStore';
import { useDebugStore } from '../store/debugStore';

// Транспортный слой стола: подписки на gameUpdate/winner/countdown/joinDenied/error,
// реджойн + запрос состояния при входе, эмиттеры действий/выхода/эмодзи.
// Карты соперников приходят с сервера per-socket (§0.1) — клиент только отображает.
// Вынесено из GameRoom (ROADMAP §9.3-E). Словарь joinDenied — общий config/denyMessages.ts (§9.3-F).

export interface GameRoomTransport {
  state: GameState | null;
  isConnected: boolean;
  winners: string[] | null;
  winningCards: CardData[];
  winHandName: string | null; // имя победной комбинации (showdown)
  winAmounts: Record<string, number>; // userId → выигранная сумма (showdown)
  countdownEndsAt: number | null;
  sendAction: (action: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) => void;
  leave: () => void;
  sendEmoji: (emoji: string) => void;
  setAutoTopUp: (cfg: { enabled: boolean; thresholdBb: number; targetBb: number }) => void;
  setHandHint: (enabled: boolean) => void;
  showCard: (index: number) => void;
  requestRabbitHunt: () => void;
}

export function useGameRoom(roomId: string | undefined, observe = false): GameRoomTransport {
  const navigate = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(() => getSocket().connected);
  const [winners, setWinners] = useState<string[] | null>(null);
  const [winningCards, setWinningCards] = useState<CardData[]>([]);
  const [winHandName, setWinHandName] = useState<string | null>(null);
  const [winAmounts, setWinAmounts] = useState<Record<string, number>>({});
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const joinRoom = () => {
      if (!roomId) return;
      if (observe) {
        socket.emit(SOCKET_EVENTS.OBSERVE_ROOM, { roomId });
      } else {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });
        socket.emit(SOCKET_EVENTS.REQUEST_GAME_STATE, { roomId });
      }
    };

    const onConnect = () => { setIsConnected(true); joinRoom(); };
    const onDisconnect = () => setIsConnected(false);

    const onUpdate = (s: GameState) => {
      // Мультитейблинг: на одном сокете приходят gameUpdate всех открытых столов —
      // в активный вид берём только свой roomId, иначе фоновый стол перетирал бы экран.
      if (roomId && s.roomId !== roomId) return;
      useDebugStore.getState().actionEnd();
      setState(s);
      if (s.phase !== 'showdown') {
        setWinners(null);
        setWinningCards([]);
        setWinHandName(null);
        setWinAmounts({});
      }
    };
    const onWinner = ({
      roomId: evtRoomId,
      winners,
      winningCards,
      handName,
      amounts,
    }: {
      roomId?: string;
      winners: string[];
      winningCards?: CardData[];
      handName?: string;
      amounts?: Record<string, number>;
    }) => {
      // Мультитейблинг: showdown фонового стола не показываем на активном.
      if (evtRoomId && roomId && evtRoomId !== roomId) return;
      setWinners(winners);
      setWinningCards(winningCards ?? []);
      setWinHandName(handName ?? null);
      setWinAmounts(amounts ?? {});
    };
    const onCountdown = ({ roomId: evtRoomId, endsAt }: { roomId?: string; endsAt: number | null }) => {
      if (evtRoomId && roomId && evtRoomId !== roomId) return;
      setCountdownEndsAt(endsAt);
    };
    const onJoinDenied = ({ reason, retryAfterSec, requiredBuyIn }: { reason: string; retryAfterSec?: number; requiredBuyIn?: number }) => {
      toast.error(denyMessage(reason, 'Доступ закрыт: ' + reason, retryAfterSec, requiredBuyIn));
      navigate('/lobby');
    };
    const onError = ({ message }: { message: string }) => toast.error(message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
    socket.on(SOCKET_EVENTS.GAME_WINNER, onWinner);
    socket.on(SOCKET_EVENTS.START_COUNTDOWN, onCountdown);
    socket.on(SOCKET_EVENTS.JOIN_DENIED, onJoinDenied);
    socket.on(SOCKET_EVENTS.ERROR, onError);

    // Реджойн: при уже подключённом сокете — сразу; иначе onConnect сделает это после connect.
    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
      socket.off(SOCKET_EVENTS.GAME_WINNER, onWinner);
      socket.off(SOCKET_EVENTS.START_COUNTDOWN, onCountdown);
      socket.off(SOCKET_EVENTS.JOIN_DENIED, onJoinDenied);
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, [navigate, roomId, observe]);

  const sendAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.PLAYER_ACTION, { roomId, action, amount });
  };

  const leave = () => {
    if (roomId) {
      getSocket().emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId });
      // Мультитейблинг: если открыты ещё столы — переключаемся на следующий, иначе в лобби.
      const remaining = useTablesStore.getState().order.filter((id) => id !== roomId);
      useTablesStore.getState().remove(roomId); // убрать пилюлю закрытого стола
      if (remaining.length > 0) {
        navigate('/game/' + remaining[0]);
        return;
      }
    }
    navigate('/lobby');
  };

  const sendEmoji = (emoji: string) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.SEND_EMOJI, { roomId, emoji });
  };

  // Преференция авто-докупки стека — сервер применит её между раздачами (cleanupHand).
  const setAutoTopUp = (cfg: { enabled: boolean; thresholdBb: number; targetBb: number }) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.SET_AUTO_TOPUP, { roomId, ...cfg });
  };

  // Тумблер подсказки комбинации/шансов — сервер начнёт/перестанет считать equity и слать подсказки.
  const setHandHint = (enabled: boolean) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.SET_HAND_HINT, { roomId, enabled });
  };

  // Добровольно показать свою карту после раздачи (index 0/1) — сервер раскроет её всем.
  const showCard = (index: number) => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.SHOW_CARD, { roomId, index });
  };

  // Rabbit Hunting (§10.12, платная фича): заплатить и увидеть карты, которые пришли бы.
  const requestRabbitHunt = () => {
    if (!roomId) return;
    getSocket().emit(SOCKET_EVENTS.RABBIT_HUNT, { roomId });
  };

  return { state, isConnected, winners, winningCards, winHandName, winAmounts, countdownEndsAt, sendAction, leave, sendEmoji, setAutoTopUp, setHandHint, showCard, requestRabbitHunt };
}

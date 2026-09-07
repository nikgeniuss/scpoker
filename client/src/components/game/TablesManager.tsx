import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getSocket } from '../../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';
import type { GameState } from '@poker-room/shared';
import { useAuthStore } from '../../store/authStore';
import { useTablesStore } from '../../store/tablesStore';
import { loadGameSettings } from '../../config/gameSettings';
import { playSound } from '../../lib/sound';
import { triggerHaptic } from '../../lib/haptic';

// Персистентный слушатель мультитейблинга: маршрутизирует gameUpdate по roomId в tablesStore.
// Живёт в Layout — переживает навигацию между столами/лобби, поэтому фоновые столы остаются
// «живыми» в пилюлях даже когда смотрим на другой. Один сокет в нескольких socket.io-комнатах
// (§0.6 не нарушаем — сокет по-прежнему один на user.id).
export const TablesManager = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  // Предыдущее состояние «мой ход» по столам — чтобы ловить переход false→true.
  const prevTurn = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!myId) {
      useTablesStore.getState().clear();
      return;
    }
    const socket = getSocket();
    const onUpdate = (s: GameState) => {
      useTablesStore.getState().observe(s, myId);
      // Сигнал «твой ход» для ФОНОВОГО стола (активный обрабатывает GameRoom сам).
      const me = s.players.find((p) => p.id === myId);
      const currentId = s.players[s.currentPlayerIndex]?.id ?? null;
      const myTurn = !!me && currentId === myId && s.phase !== 'waiting' && s.phase !== 'showdown';
      const was = prevTurn.current[s.roomId] ?? false;
      prevTurn.current[s.roomId] = myTurn;
      if (myTurn && !was) {
        const activeId = window.location.pathname.startsWith('/game/')
          ? window.location.pathname.slice('/game/'.length)
          : null;
        if (s.roomId !== activeId) {
          const gs = loadGameSettings();
          if (gs.soundEnabled) playSound('turn');
          if (gs.vibrationEnabled) triggerHaptic('medium');
        }
      }
    };
    socket.on(SOCKET_EVENTS.GAME_UPDATE, onUpdate);

    // Бейдж результата на пилюле: при моём выигрыше на showdown — записать сумму в стол.
    const onWinner = ({ roomId, winners, amounts }: { roomId?: string; winners: string[]; amounts?: Record<string, number> }) => {
      if (!roomId || !winners.includes(myId)) return;
      useTablesStore.getState().setResult(roomId, amounts?.[myId] ?? 0);
    };
    socket.on(SOCKET_EVENTS.GAME_WINNER, onWinner);

    // Пересадка при балансировке MTT: сервер уже перевёл сокет на новый стол. Уводим туда же
    // экран, иначе игрок остаётся смотреть на опустевший старый стол («ждём второго игрока»),
    // а пилюля закрытого стола висит до перезагрузки (живой прогон 2026-09-02).
    const onTableAssigned = ({ roomId, fromRoomId }: { tournamentId?: string; roomId?: string; fromRoomId?: string }) => {
      if (!roomId || !fromRoomId) return; // без fromRoomId это первичная посадка (старт турнира) — не дёргаем экран
      useTablesStore.getState().remove(fromRoomId);
      if (window.location.pathname === '/game/' + fromRoomId) {
        toast(t('tablesManager.movedToNewTable'));
        navigate('/game/' + roomId);
      }
    };
    socket.on(SOCKET_EVENTS.TOURNAMENT_TABLE_ASSIGNED, onTableAssigned);

    // Восстановление столов на (ре)коннекте/reload делает СЕРВЕР (reconnectUserTables):
    // он сам возвращает сокет в комнаты, где игрок сидит, и шлёт состояние → пилюли вернутся.
    // Клиентский re-join не нужен (и был бы рискованным — мог пере-сажать).

    return () => {
      socket.off(SOCKET_EVENTS.GAME_UPDATE, onUpdate);
      socket.off(SOCKET_EVENTS.GAME_WINNER, onWinner);
      socket.off(SOCKET_EVENTS.TOURNAMENT_TABLE_ASSIGNED, onTableAssigned);
    };
  }, [myId, navigate, t]);

  return null;
};

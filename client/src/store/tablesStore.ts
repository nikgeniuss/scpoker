import { create } from 'zustand';
import type { GameState } from '@poker-room/shared';
import type { CardData } from '../components/game/Card';

// Стол мультитейблинга — slim-запись для пилюль (top-left). Полное состояние активного
// стола по-прежнему держит GameRoom через useGameRoom; здесь — только то, что нужно пилюлям:
// мои карты + флаг «мой ход» + имя/фаза.
export interface OpenTable {
  roomId: string;
  roomName: string;
  myCards: CardData[];
  isMyTurn: boolean;
  phase: string;
  wonAmount?: number; // выигрыш в текущем showdown (для бейджа на пилюле); сбрасывается вне showdown
}

interface TablesState {
  order: string[]; // порядок открытых столов (макс MAX_TABLES)
  tables: Record<string, OpenTable>;
  // Обновить запись стола из пришедшего gameUpdate (роутинг по roomId делает вызывающий).
  observe: (state: GameState, myId: string) => void;
  // Записать выигрыш на showdown (из GAME_WINNER) — для бейджа на пилюле.
  setResult: (roomId: string, wonAmount: number) => void;
  remove: (roomId: string) => void;
  clear: () => void;
}

export const MAX_TABLES = 3;

export const useTablesStore = create<TablesState>((set) => ({
  order: [],
  tables: {},
  observe: (state, myId) =>
    set((prev) => {
      const me = state.players.find((p) => p.id === myId);
      // Меня нет за этим столом (не сел / вышел) — пилюлю не держим.
      if (!me) {
        if (!prev.tables[state.roomId]) return prev;
        const tables = { ...prev.tables };
        delete tables[state.roomId];
        return { tables, order: prev.order.filter((id) => id !== state.roomId) };
      }
      const currentId = state.players[state.currentPlayerIndex]?.id ?? null;
      const actionable = state.phase !== 'waiting' && state.phase !== 'showdown';
      // wonAmount держим только пока showdown; на следующей фазе (waiting/preflop) сбрасываем.
      const wonAmount = state.phase === 'showdown' ? prev.tables[state.roomId]?.wonAmount : undefined;
      const table: OpenTable = {
        roomId: state.roomId,
        roomName: state.roomName,
        myCards: (me.cards ?? []) as CardData[],
        isMyTurn: actionable && currentId === myId,
        phase: state.phase,
        wonAmount,
      };
      const inOrder = prev.order.includes(state.roomId);
      // Превышение лимита столов не добавляем в order (но запись обновим, если уже была).
      const order = inOrder
        ? prev.order
        : prev.order.length < MAX_TABLES
          ? [...prev.order, state.roomId]
          : prev.order;
      if (!inOrder && order === prev.order) return prev; // лимит достигнут — игнор нового стола
      return { tables: { ...prev.tables, [state.roomId]: table }, order };
    }),
  setResult: (roomId, wonAmount) =>
    set((prev) => {
      const t = prev.tables[roomId];
      if (!t) return prev;
      return { tables: { ...prev.tables, [roomId]: { ...t, wonAmount } } };
    }),
  remove: (roomId) =>
    set((prev) => {
      if (!prev.tables[roomId] && !prev.order.includes(roomId)) return prev;
      const tables = { ...prev.tables };
      delete tables[roomId];
      return { tables, order: prev.order.filter((id) => id !== roomId) };
    }),
  clear: () => set({ order: [], tables: {} }),
}));

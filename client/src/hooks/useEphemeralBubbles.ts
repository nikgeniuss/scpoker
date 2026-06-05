import { useState } from 'react';
import { SOCKET_EVENTS } from '@poker-room/shared';
import { useSocketEvent } from './useSocketEvent';

// Эфемерные «речевые» пузыри над игроками: последнее действие + эмодзи-реакция.
// key инкрементируется (Date.now) чтобы перезапускать анимацию; авто-очистка через 2 сек,
// если за это время не пришло нового события от того же игрока. Вынесено из GameRoom (§9.3-E).
// Подписки через useSocketEvent — авто-off, без ручного on/off (§9.3-F).
export interface ActionBubbleData {
  action: string;
  amount?: number;
  key: number;
}
export interface EmojiBubbleData {
  emoji: string;
  key: number;
}

export function useEphemeralBubbles(): {
  actionBubbles: Record<string, ActionBubbleData>;
  emojiBubbles: Record<string, EmojiBubbleData>;
} {
  const [actionBubbles, setActionBubbles] = useState<Record<string, ActionBubbleData>>({});
  const [emojiBubbles, setEmojiBubbles] = useState<Record<string, EmojiBubbleData>>({});

  useSocketEvent<{ playerId: string; action: string; amount?: number }>(
    SOCKET_EVENTS.PLAYER_ACTION_BROADCAST,
    ({ playerId, action, amount }) => {
      const key = Date.now();
      setActionBubbles((prev) => ({ ...prev, [playerId]: { action, amount, key } }));
      setTimeout(() => {
        // Чистим только если за 2 сек не пришло нового действия от того же игрока (key совпадает)
        setActionBubbles((cur) => {
          if (cur[playerId]?.key !== key) return cur;
          const { [playerId]: _drop, ...rest } = cur;
          return rest;
        });
      }, 2000);
    },
  );

  useSocketEvent<{ playerId: string; emoji: string }>(
    SOCKET_EVENTS.EMOJI_BROADCAST,
    ({ playerId, emoji }) => {
      const key = Date.now();
      setEmojiBubbles((prev) => ({ ...prev, [playerId]: { emoji, key } }));
      setTimeout(() => {
        setEmojiBubbles((cur) => {
          if (cur[playerId]?.key !== key) return cur;
          const { [playerId]: _drop, ...rest } = cur;
          return rest;
        });
      }, 2000);
    },
  );

  return { actionBubbles, emojiBubbles };
}

import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

// Подписка на socket-событие с автоматическим off при размонтировании (ROADMAP §9.3-F).
// handler хранится в ref → подписка не пере-навешивается на смену идентичности колбэка,
// но вызывает всегда свежий handler. enabled=false — не подписываться (guard вроде !user).
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const fn = (data: T) => handlerRef.current(data);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [event, enabled]);
}

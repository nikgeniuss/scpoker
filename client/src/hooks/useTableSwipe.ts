import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTablesStore } from '../store/tablesStore';

// Свайп между столами при мультитейблинге (ROADMAP §10.16) — альтернатива клику по пилюле.
// Горизонтальный свайп влево → следующий стол, вправо → предыдущий (по кругу в `order`).
// Вешается на корень GameRoom. Жесты, начавшиеся в зоне `[data-noswipe]` (слайдер рейза,
// карусель и т.п.), игнорируются, чтобы не конфликтовать с управлением ставкой.
export function useTableSwipe(activeId: string | undefined) {
  const navigate = useNavigate();
  const start = useRef<{ x: number; y: number; t: number; ignore: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const order = useTablesStore.getState().order;
    if (order.length < 2) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    const ignore = !!(e.target as HTMLElement | null)?.closest('[data-noswipe]');
    start.current = { x: t.clientX, y: t.clientY, t: e.timeStamp, ignore };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.ignore) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = e.timeStamp - s.t;
    // Быстрый, явно горизонтальный жест.
    if (dt > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const order = useTablesStore.getState().order;
    const idx = activeId ? order.indexOf(activeId) : -1;
    if (idx === -1 || order.length < 2) return;
    const next = dx < 0 ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length;
    if (order[next] !== activeId) navigate('/game/' + order[next]);
  };

  return { onTouchStart, onTouchEnd };
}

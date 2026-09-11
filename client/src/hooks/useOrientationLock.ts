import { useEffect } from 'react';
import type { OrientationLock } from '../config/gameSettings';

// Блокировка ориентации экрана за столом (§10.16, настройка игрока). Screen Orientation API
// доступен не везде: Chrome на Android разрешает lock только в полноэкранном режиме, iOS Safari
// не поддерживает его вовсе. Поэтому строго best-effort — отказ браузера ничего не ломает, игрок
// просто продолжает играть в системной ориентации (в UI об этом сказано под настройкой).
type LockableOrientation = { lock?: (o: string) => Promise<void>; unlock?: () => void };

export function useOrientationLock(mode: OrientationLock): void {
  useEffect(() => {
    const orientation = (screen as unknown as { orientation?: LockableOrientation }).orientation;
    if (!orientation) return;

    if (mode === 'auto') {
      try {
        orientation.unlock?.();
      } catch {
        // Браузер не разрешает — оставляем как есть
      }
      return;
    }

    // lock возвращает промис и отклоняется, когда режим недоступен (не fullscreen, iOS и т.п.) —
    // отказ гасим, иначе он всплывает как unhandled rejection.
    orientation.lock?.(mode)?.catch(() => {});

    return () => {
      try {
        orientation.unlock?.();
      } catch {
        // см. выше
      }
    };
  }, [mode]);
}

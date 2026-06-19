import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../config/api';
import { useDebugStore } from '../../store/debugStore';

export const DebugOverlay = () => {
  const [fps, setFps] = useState(0);
  const [ping, setPing] = useState<number | null>(null);
  const [downlink, setDownlink] = useState<number | null>(null);
  const frameCount = useRef(0);
  // eslint-disable-next-line react-hooks/purity
  const lastTime = useRef(performance.now());
  const lastActionMs = useDebugStore((s) => s.lastActionMs);
  const lastActionLabel = useDebugStore((s) => s.lastActionLabel);

  // FPS через rAF
  useEffect(() => {
    let id: number;
    const tick = (now: number) => {
      frameCount.current++;
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastTime.current = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  // Ping через fetch /health каждые 3 с
  useEffect(() => {
    const measure = async () => {
      const t = performance.now();
      try {
        await fetch(API_URL + '/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        setPing(Math.round(performance.now() - t));
      } catch {
        setPing(-1);
      }
    };
    measure();
    const id = setInterval(measure, 3000);
    return () => clearInterval(id);
  }, []);

  // Скорость соединения — Network Information API (Chrome/Android)
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { downlink: number; addEventListener: (e: string, cb: () => void) => void; removeEventListener: (e: string, cb: () => void) => void } }).connection;
    if (!conn) return;
    const update = () => setDownlink(conn.downlink ?? null);
    update();
    conn.addEventListener('change', update);
    return () => conn.removeEventListener('change', update);
  }, []);

  return (
    <div className="fixed top-16 right-1 z-[9999] text-[9px] font-mono text-emerald-400/70 pointer-events-none space-y-px text-right leading-tight select-none">
      <div>FPS {fps}</div>
      <div>PING {ping === null ? '…' : ping === -1 ? 'ERR' : ping + 'ms'}</div>
      {downlink !== null && <div>NET {downlink}Mbps</div>}
      {lastActionMs !== null && (
        <div className="text-emerald-300/80">{lastActionLabel} {lastActionMs}ms</div>
      )}
    </div>
  );
};

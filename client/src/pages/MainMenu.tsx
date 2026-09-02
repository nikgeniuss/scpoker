import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useTelegram } from '../hooks/useTelegram';
import { useMyClub } from '../hooks/useMyClub';
import { useLobbyData } from '../hooks/useLobbyData';
import { PageBackground } from '../components/layout/PageBackground';
import { CreateClubModal } from '../components/club/CreateClubModal';
import { JoinClubModal } from '../components/club/JoinClubModal';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import { formatMoney } from '../config/chipFormat';
import { tgLinkDeepLink, tgAppDeepLink } from '../lib/telegram';
import { TelegramButton } from '../components/auth/TelegramButton';

const noop = () => {};

export const MainMenu = () => {
  const { t } = useTranslation();
  const { isTelegram } = useTelegram();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { refresh: refreshClub } = useMyClub();
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [showJoinClub, setShowJoinClub] = useState(false);

  // Drag-скролл каруселью мышью (тач скроллит нативно через overflow-x-auto — этого
  // не трогаем, обрабатываем только pointerType === 'mouse'). После отпускания —
  // инерция (rAF-цикл с затуханием скорости), нативный scroll-snap мягко довершает
  // прилипание к ближайшей карточке сам, без ручной анимации.
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    isDown: false,
    isMouse: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    moved: false,
    lastX: 0,
    lastT: 0,
    velocity: 0,
  });
  const inertiaRaf = useRef<number | null>(null);

  const stopInertia = () => {
    if (inertiaRaf.current !== null) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = null;
    }
  };
  useEffect(() => stopInertia, []);

  // Скроллим карусель полностью сами (для любого pointerType, не только мыши) — в
  // некоторых вебвью (замечено в Telegram Desktop) нативный touch-scroll overflow-x-auto
  // не двигает scrollLeft вообще. На время активного драга/инерции снимаем scroll-snap —
  // иначе браузер тянет scrollLeft обратно к ближайшей карточке прямо во время движения
  // пальца, и драг дёргается рывками; snap возвращаем, когда палец/инерция остановились,
  // чтобы карточка мягко прилипла в конце.
  const onCarouselPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!carouselRef.current) return;
    stopInertia();
    carouselRef.current.style.scrollSnapType = 'none';
    const now = performance.now();
    drag.current = {
      isDown: true,
      isMouse: e.pointerType === 'mouse',
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: carouselRef.current.scrollLeft,
      moved: false,
      lastX: e.clientX,
      lastT: now,
      velocity: 0,
    };
  };
  const onCarouselPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = carouselRef.current;
    if (!drag.current.isDown || !el) return;
    // Забираем жест полностью себе — в некоторых вебвью (замечено в Telegram Desktop)
    // нативный touch-scroll overflow-x-auto не работает вообще (scrollLeft не двигается),
    // поэтому scrollLeft двигаем сами для любого pointerType, а preventDefault не даёт
    // браузеру параллельно попытаться сделать то же самое нативно (второй раз).
    e.preventDefault();
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.scrollLeft - dx;
    const now = performance.now();
    const dt = now - drag.current.lastT;
    if (dt > 0) {
      drag.current.velocity = (e.clientX - drag.current.lastX) / dt;
      drag.current.lastX = e.clientX;
      drag.current.lastT = now;
    }
  };
  const onCarouselPointerUp = () => {
    if (!drag.current.isDown) return;
    drag.current.isDown = false;
    const el = carouselRef.current;
    let velocity = drag.current.velocity;
    if (!el || Math.abs(velocity) < 0.02) {
      if (el) el.style.scrollSnapType = '';
      return;
    }
    let lastFrame = performance.now();
    const step = (now: number) => {
      const dt = now - lastFrame;
      lastFrame = now;
      el.scrollLeft -= velocity * dt;
      velocity *= 0.94;
      if (Math.abs(velocity) < 0.02) {
        inertiaRaf.current = null;
        el.style.scrollSnapType = '';
        return;
      }
      inertiaRaf.current = requestAnimationFrame(step);
    };
    inertiaRaf.current = requestAnimationFrame(step);
  };
  const onCarouselPointerCancel = () => {
    drag.current.isDown = false;
    if (carouselRef.current) carouselRef.current.style.scrollSnapType = '';
  };
  // Клик по карточке после драга не должен переходить в лобби — это была прокрутка, не тап.
  // На тач-свайпе браузер не всегда шлёт нам pointermove до конца жеста (сам забирает
  // скролл), поэтому дополнительно сверяем реальный scrollLeft «до» и «после» — если
  // карусель физически сдвинулась, это точно был свайп, а не тап.
  const onCardClick = () => {
    const el = carouselRef.current;
    const scrolled = !!el && Math.abs(el.scrollLeft - drag.current.scrollLeft) > 2;
    if (drag.current.moved || scrolled) return;
    navigate('/lobby');
  };

  // Баннер «Быстрая игра» — онлайн-счётчик и мин. ставка считаются из реально открытых
  // столов (тот же транспорт, что в Lobby.tsx), референс «Modern Poker Club».
  const { rooms } = useLobbyData(noop);
  const onlineCount = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rooms) for (const id of r.playerIds) ids.add(id);
    return ids.size;
  }, [rooms]);
  const minStakeBb = useMemo(
    () => (rooms.length > 0 ? Math.min(...rooms.map((r) => r.bigBlind)) : null),
    [rooms],
  );

  const handleLinkTelegram = async () => {
    try {
      const res = await fetch(API_URL + '/auth/link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Не удалось начать привязку');
        return;
      }
      const { code } = await res.json();
      window.location.href = tgLinkDeepLink(code);
    } catch {
      toast.error('Ошибка сети');
    }
  };

  const handleOpenTelegram = () => {
    window.location.href = tgAppDeepLink();
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <PageBackground />

      <div className="relative z-10 container mx-auto px-4 py-16 flex flex-col items-center justify-end min-h-[calc(100dvh-4rem)]">

        {/* Стек «Быстрая игра» + карусель кэш-столов — один якорь сверху (flex-col),
            чтобы карусель всегда шла сразу под баннером независимо от его высоты. */}
        <div className="fixed left-1/2 -translate-x-1/2 top-[calc(4rem+0.75rem)] z-20 w-full max-w-sm px-4 flex flex-col gap-3">
          {/* Баннер «Быстрая игра» — референс «Modern Poker Club»: онлайн-счётчик + мин. ставка + CTA. */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-tl-3xl rounded-br-3xl rounded-tr-md rounded-bl-md px-5 py-4 border bg-gray-900/55 backdrop-blur-md border-amber-500/20 shadow-lg shadow-black/40"
          >
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 mb-2">
              <Zap size={11} /> {t('mainMenu.quickPlay')}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-300 mb-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0" />
              {t('mainMenu.playersOnline', { count: onlineCount })}
            </div>
            {minStakeBb !== null && (
              <div className="text-sm text-gray-400 mb-3">
                {t('mainMenu.minStake')} <span className="text-white font-bold">${formatMoney(minStakeBb)}</span>
              </div>
            )}
            <button
              onClick={() => navigate('/lobby')}
              className="w-full py-2.5 rounded-xl font-bold transition-all bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
            >
              {t('mainMenu.play')}
            </button>
          </motion.div>

          {/* Карусель кэш-столов — референс «Modern Poker Club»: превью нескольких столов
              компактными карточками, горизонтальный скролл, «Все →» ведёт в полное лобби. */}
          {rooms.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('mainMenu.cashGames')}</span>
                <button onClick={() => navigate('/lobby')} className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
                  {t('mainMenu.seeAll')} →
                </button>
              </div>
              <div
                ref={carouselRef}
                onPointerDown={onCarouselPointerDown}
                onPointerMove={onCarouselPointerMove}
                onPointerUp={onCarouselPointerUp}
                onPointerLeave={onCarouselPointerUp}
                onPointerCancel={onCarouselPointerCancel}
                // Свайп по карусели не должен долетать до Layout.tsx — там на <main>
                // висит свой touchstart/touchend для переключения вкладок нижнего бара
                // (tabRoutes), и он независимо от нас интерпретирует тот же палец как
                // «пролистнуть вкладку». Pointer Events это не блокируют — нужно гасить
                // именно нативные touch-события.
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="flex gap-2.5 overflow-x-auto no-scrollbar touch-none overscroll-x-contain pb-1 -mx-4 px-4 snap-x snap-mandatory cursor-grab active:cursor-grabbing"
              >
                {rooms.slice(0, 8).map((room) => (
                  <button
                    key={room.id}
                    onClick={onCardClick}
                    className="shrink-0 snap-start w-28 text-left rounded-xl px-3 py-2.5 border bg-gray-900/55 backdrop-blur-md border-white/10 hover:border-emerald-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white tabular-nums truncate">
                        ${formatMoney(room.smallBlind)}/${formatMoney(room.bigBlind)}
                      </span>
                      <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + (room.status === 'playing' ? 'bg-red-400' : 'bg-emerald-400')} />
                    </div>
                    <div className="text-[11px] text-gray-400 mb-1.5">
                      {room.currentPlayers}/{room.maxPlayers} {t('lobby.players')}
                    </div>
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={
                          'h-full rounded-full ' +
                          (room.currentPlayers >= room.maxPlayers ? 'bg-red-400' : room.currentPlayers / room.maxPlayers >= 0.5 ? 'bg-amber-400' : 'bg-emerald-400')
                        }
                        style={{ width: (room.maxPlayers > 0 ? (room.currentPlayers / room.maxPlayers) * 100 : 0) + '%' }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Telegram-кнопка */}
        {!isTelegram && (
          <TelegramButton
            label={user ? t('mainMenu.linkTelegram') : t('mainMenu.playInTelegram')}
            onClick={user ? handleLinkTelegram : handleOpenTelegram}
            delay={0.6}
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-20"
          />
        )}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 text-center"
        >
          <div
            className="inline-flex items-center gap-2 text-white/80 text-sm"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
          >
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>{t('mainMenu.online')}</span>
            <span className="opacity-60">|</span>
            <span>v1.0.0</span>
            <span className="opacity-60">|</span>
            {isTelegram ? (
              <span className="text-blue-300">{t('mainMenu.telegramMiniApp')}</span>
            ) : (
              <span>{t('mainMenu.browser')}</span>
            )}
          </div>
        </motion.div>
      </div>

      {/* Модалка создания клуба */}
      <AnimatePresence>
        {showCreateClub && (
          <CreateClubModal
            onClose={() => setShowCreateClub(false)}
            onCreated={() => {
              setShowCreateClub(false);
              refreshClub();
              navigate('/my-club');
            }}
          />
        )}
        {showJoinClub && (
          <JoinClubModal
            onClose={() => setShowJoinClub(false)}
            onJoined={() => {
              setShowJoinClub(false);
              refreshClub();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

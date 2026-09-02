import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, Clock } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import type { RoomInfo } from '@poker-room/shared';

// Карточка стола в лобби. Вынесено из Lobby (ROADMAP §9.3-E).
interface RoomCardProps {
  room: RoomInfo;
  imIn: boolean;
  myQueuePos: number; // 0 — не в очереди; иначе 1-based позиция в очереди этого стола
  onJoin: () => void;
  onQueue: () => void;
  onLeaveQueue: () => void;
}

export const RoomCard = ({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue }: RoomCardProps) => {
  const { t } = useTranslation();
  const queueCount = room.waitlistIds.length;
  // «Полный» = мест нет ИЛИ есть очередь: пока кто-то ждёт, освободившееся место
  // зарезервировано за очередью (сервер вернёт 'full' прямому входу) — показываем «Занять очередь».
  const isFull = room.currentPlayers >= room.maxPlayers || queueCount > 0;
  const isPlaying = room.status === 'playing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={
        'relative rounded-2xl pl-7 pr-5 py-4 border transition-colors overflow-hidden ' +
        (imIn
          ? 'bg-emerald-900/40 backdrop-blur-md border-emerald-500/50 hover:border-emerald-400'
          : 'bg-gray-900/55 backdrop-blur-md border-white/10 hover:border-emerald-500/50')
      }
    >
      {/* Вертикальная плашка формата слева: NLH — зелёная, Шорт-дэк — янтарная. */}
      <div
        className={
          'absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-b flex items-center justify-center ' +
          (room.format === 'shortdeck' ? 'from-amber-500 to-amber-700' : 'from-emerald-500 to-emerald-700')
        }
      >
        <span
          className="text-white text-[10px] font-black tracking-widest"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {room.format === 'shortdeck' ? t('lobby.formatShortdeck').toUpperCase() : 'NLH'}
        </span>
      </div>

      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {/* Блайнды — главный заголовок карточки (как в топ-румах: лимит важнее имени стола,
              GGPoker/PokerStars ведут лобби по лимитам, имя стола — второстепенная деталь). */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-white tabular-nums truncate">
              ${formatMoney(room.smallBlind)}/${formatMoney(room.bigBlind)}
            </h3>
            {imIn && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white uppercase tracking-wider shrink-0">
                {t('lobby.youAreHere')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            {room.hasPassword && <span title={t('lobby.privateTable')} className="shrink-0 inline-flex"><Lock size={12} className="text-yellow-400" /></span>}
            <span className="text-xs text-gray-400 truncate">{room.name}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ' +
              (isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')
            }
          >
            <span className={'w-1.5 h-1.5 rounded-full ' + (isPlaying ? 'bg-red-400' : 'bg-emerald-400')} />
            {isPlaying ? t('lobby.playing') : t('lobby.waiting')}
          </span>
        </div>
      </div>

      {room.description && (
        <p className="text-xs text-gray-400 italic mb-2 line-clamp-2" title={room.description}>
          {room.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mb-2">
        <span className="inline-flex items-center gap-1">
          {t('lobby.players')} <span className="text-white font-bold">{room.currentPlayers}/{room.maxPlayers}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          {t('lobby.minBuyIn')} <span className="text-emerald-400 font-bold">{room.buyInMinBb}-{room.buyInMaxBb}BB</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> <span className="text-emerald-400 font-bold">{room.turnDurationSec}{t('lobby.secShort')}</span>
        </span>
        {room.rake.percent > 0 && (
          <span className="inline-flex items-center gap-1" title={t('lobby.rakeTooltip', { percent: room.rake.percent, cap: room.rake.capBb })}>
            <span className="text-gray-500">{t('lobby.rake')}</span> <span className="text-amber-400 font-bold">{room.rake.percent}%</span>
          </span>
        )}
      </div>

      {/* Прогресс-бар заполнения стола + кнопка действия в одну строку, кнопка справа
          (референс «Modern Poker Club» — линия заполненности и CTA на одной высоте). */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-[32px] h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={
              'h-full rounded-full transition-all ' +
              (room.currentPlayers >= room.maxPlayers ? 'bg-red-400' : room.currentPlayers / room.maxPlayers >= 0.5 ? 'bg-amber-400' : 'bg-emerald-400')
            }
            style={{ width: (room.maxPlayers > 0 ? (room.currentPlayers / room.maxPlayers) * 100 : 0) + '%' }}
          />
        </div>

        {imIn ? (
          <button
            onClick={onJoin}
            className="shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
          >
            {t('lobby.return')}
          </button>
        ) : !isFull ? (
          <button
            onClick={onJoin}
            className="shrink-0 px-3 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
          >
            {t('lobby.join')}
          </button>
        ) : myQueuePos > 0 ? (
          // Я в очереди на этот полный стол — позиция + выход
          <div className="shrink-0 flex items-center gap-2">
            <span className="py-2 px-2.5 rounded-full font-bold text-center bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs whitespace-nowrap">
              {queueCount > 1 ? t('lobby.inQueueOf', { pos: myQueuePos, count: queueCount }) : t('lobby.inQueue', { pos: myQueuePos })}
            </span>
            <button
              onClick={onLeaveQueue}
              className="px-3 py-2 rounded-full font-bold text-xs whitespace-nowrap bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              {t('lobby.leaveQueue')}
            </button>
          </div>
        ) : (
          // Полный стол — встать в очередь на авто-посадку
          <button
            onClick={onQueue}
            className="shrink-0 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30"
          >
            {queueCount > 0 ? t('lobby.joinQueueWaiting', { count: queueCount }) : t('lobby.joinQueue')}
          </button>
        )}
      </div>
    </motion.div>
  );
};

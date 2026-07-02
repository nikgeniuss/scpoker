import { motion } from 'framer-motion';
import ReactNiceAvatar from 'react-nice-avatar';
import { useTranslation } from 'react-i18next';
import { Lock, Clock, Coins, Eye } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import { avatarConfig } from '../../utils/avatar';
import type { RoomInfo } from '@poker-room/shared';

// Карточка стола в лобби. Вынесено из Lobby (ROADMAP §9.3-E).
interface RoomCardProps {
  room: RoomInfo;
  imIn: boolean;
  myQueuePos: number; // 0 — не в очереди; иначе 1-based позиция в очереди этого стола
  onJoin: () => void;
  onQueue: () => void;
  onLeaveQueue: () => void;
  onObserve: () => void;
}

export const RoomCard = ({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue, onObserve }: RoomCardProps) => {
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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-white truncate">{room.name}</h3>
            {room.hasPassword && <span title={t('lobby.privateTable')} className="shrink-0 inline-flex"><Lock size={14} className="text-yellow-400" /></span>}
            {imIn && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white uppercase tracking-wider shrink-0">
                {t('lobby.youAreHere')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{t('lobby.createdBy')} {room.createdBy}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <FillCircle current={room.currentPlayers} max={room.maxPlayers} />
          <span
            className={
              'px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ' +
              (isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')
            }
          >
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
          {t('lobby.blinds')} <span className="text-white font-bold">{formatMoney(room.smallBlind)}/{formatMoney(room.bigBlind)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> <span className="text-emerald-400 font-bold">{room.turnDurationSec}{t('lobby.secShort')}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Coins size={11} /> <span className="text-emerald-400 font-bold">{room.buyInMinBb}-{room.buyInMaxBb}BB</span>
        </span>
        {room.rake.percent > 0 && (
          <span className="inline-flex items-center gap-1" title={t('lobby.rakeTooltip', { percent: room.rake.percent, cap: room.rake.capBb })}>
            <span className="text-gray-500">{t('lobby.rake')}</span> <span className="text-amber-400 font-bold">{room.rake.percent}%</span>
          </span>
        )}
      </div>

      {/* Превью игроков — мини-аватары + пустые слоты */}
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: room.maxPlayers }).map((_, i) => {
          const p = room.players[i];
          if (!p) {
            return (
              <div
                key={'empty-' + i}
                className="w-6 h-6 rounded-full border border-dashed border-white/15"
                title={t('lobby.emptySeat')}
              />
            );
          }
          return (
            <div
              key={p.id}
              title={p.username}
              className="w-6 h-6 rounded-full overflow-hidden shadow ring-1 ring-black/30"
            >
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(p.avatar || p.id)} />
            </div>
          );
        })}
      </div>

      {imIn ? (
        <button
          onClick={onJoin}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
        >
          {t('lobby.return')}
        </button>
      ) : !isFull ? (
        <button
          onClick={onJoin}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
        >
          {t('lobby.join')}
        </button>
      ) : myQueuePos > 0 ? (
        // Я в очереди на этот полный стол — позиция + выход
        <div className="flex items-center gap-2">
          <span className="flex-1 py-2 rounded-xl font-bold text-center bg-amber-500/15 text-amber-300 border border-amber-500/40 text-sm">
            {queueCount > 1 ? t('lobby.inQueueOf', { pos: myQueuePos, count: queueCount }) : t('lobby.inQueue', { pos: myQueuePos })}
          </span>
          <button
            onClick={onLeaveQueue}
            className="px-3 py-2 rounded-xl font-bold text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            {t('lobby.leaveQueue')}
          </button>
        </div>
      ) : (
        // Полный стол — встать в очередь на авто-посадку
        <button
          onClick={onQueue}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30"
        >
          {queueCount > 0 ? t('lobby.joinQueueWaiting', { count: queueCount }) : t('lobby.joinQueue')}
        </button>
      )}

      {/* Наблюдать — зрителем за любой стол (мест нет / просто посмотреть). Карты соперников
          скрыты; админ видит открытые. Не показываем тем, кто уже за этим столом. */}
      {!imIn && (
        <button
          onClick={onObserve}
          className="mt-2 w-full py-1.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-center gap-1.5"
        >
          <Eye size={13} /> {t('lobby.observe')}
        </button>
      )}
    </motion.div>
  );
};

// SVG-кольцо заполнения: зелёное на полную, серое на пустую, число в центре
const FillCircle = ({ current, max }: { current: number; max: number }) => {
  const { t } = useTranslation();
  const ratio = max > 0 ? current / max : 0;
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - ratio);
  const colorClass =
    ratio >= 1 ? 'text-red-400' : ratio >= 0.5 ? 'text-emerald-400' : 'text-gray-500';
  return (
    <div className="relative" title={t('lobby.playersOf', { current, max })}>
      <svg width={size} height={size} className={colorClass}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeOpacity={0.15}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
        {current}/{max}
      </div>
    </div>
  );
};

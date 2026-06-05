import { motion } from 'framer-motion';
import { Lock, Clock, Coins } from 'lucide-react';
import { avatarColor } from '../game/seatColors';
import type { RoomInfo } from '@poker-room/shared';

// Карточка стола в лобби. Вынесено из Lobby (ROADMAP §9.3-E).
interface RoomCardProps {
  room: RoomInfo;
  imIn: boolean;
  onJoin: () => void;
}

export const RoomCard = ({ room, imIn, onJoin }: RoomCardProps) => {
  const isFull = room.currentPlayers >= room.maxPlayers;
  const isPlaying = room.status === 'playing';
  // Late entry разрешён: в playing-комнату можно сесть с обычным buy-in,
  // карты придут со следующей раздачи. Блокируем только если стол заполнен.
  const disabled = !imIn && isFull;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={
        'relative rounded-2xl pl-7 pr-5 py-4 border transition-colors overflow-hidden ' +
        (imIn
          ? 'bg-emerald-900/30 border-emerald-500/50 hover:border-emerald-400'
          : 'bg-gray-800 border-white/10 hover:border-emerald-500/50')
      }
    >
      {/* Вертикальная плашка формата слева (NLH — зелёный; Шорт-дэк позже будет другого цвета) */}
      <div className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-b from-emerald-500 to-emerald-700 flex items-center justify-center">
        <span
          className="text-white text-[10px] font-black tracking-widest"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          NLH
        </span>
      </div>

      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-white truncate">{room.name}</h3>
            {room.hasPassword && <span title="Приватный стол" className="shrink-0 inline-flex"><Lock size={14} className="text-yellow-400" /></span>}
            {imIn && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white uppercase tracking-wider shrink-0">
                Вы здесь
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">от {room.createdBy}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <FillCircle current={room.currentPlayers} max={room.maxPlayers} />
          <span
            className={
              'px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ' +
              (isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')
            }
          >
            {isPlaying ? 'В игре' : 'Ожидание'}
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
          Блайнды <span className="text-white font-bold">{room.smallBlind}/{room.bigBlind}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> <span className="text-emerald-400 font-bold">{room.turnDurationSec}с</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Coins size={11} /> <span className="text-emerald-400 font-bold">{room.buyInMinBb}-{room.buyInMaxBb}BB</span>
        </span>
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
                title="Свободное место"
              />
            );
          }
          const initial = p.username.charAt(0).toUpperCase();
          return (
            <div
              key={p.id}
              title={p.username}
              className={
                'w-6 h-6 rounded-full bg-gradient-to-br ' +
                avatarColor(p.username) +
                ' flex items-center justify-center text-white text-[10px] font-bold shadow ring-1 ring-black/30'
              }
            >
              {initial}
            </div>
          );
        })}
      </div>

      <button
        disabled={disabled}
        onClick={onJoin}
        className={
          'w-full py-2 rounded-xl font-bold transition-all ' +
          (disabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : imIn
            ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/30'
            : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30')
        }
      >
        {imIn ? 'Вернуться' : 'Войти'}
      </button>
    </motion.div>
  );
};

// SVG-кольцо заполнения: зелёное на полную, серое на пустую, число в центре
const FillCircle = ({ current, max }: { current: number; max: number }) => {
  const ratio = max > 0 ? current / max : 0;
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - ratio);
  const colorClass =
    ratio >= 1 ? 'text-red-400' : ratio >= 0.5 ? 'text-emerald-400' : 'text-gray-500';
  return (
    <div className="relative" title={current + ' из ' + max + ' игроков'}>
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

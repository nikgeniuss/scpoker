import { memo } from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';
import type { CardData } from './Card';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
import type { CardColorScheme } from '../../config/cardColors';
import { TurnProgressRing } from './TurnProgressRing';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../../utils/avatar';
import { avatarColor } from './seatColors';

export interface PlayerView {
  id: string;
  username: string;
  chips: number;
  cards: CardData[];
  isFolded: boolean;
  currentBet: number;
  position: number;
  disconnected?: boolean;
  timebank?: number; // оставшиеся секунды таймбанка (для подписи под ником, если timebankEnabled)
}

interface PlayerSeatProps {
  player: PlayerView;
  isSelf: boolean;
  isCurrent: boolean;
  isDealer: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  isWinner: boolean;
  showHand: boolean;
  faceStyle: string;
  backStyle: string;
  cardColors?: CardColorScheme;
  // chipStyle оставлен в API, чтобы не ломать вызовы; внутри больше не используется
  // (отображение ставок переехало в ChipStack у центра стола).
  chipStyle?: string;
  bigBlind: number;
  displayMode: ChipDisplay;
  winningCards?: CardData[]; // На шоудауне у победителя — карты, входящие в выигрышную комбинацию
  turnSecondsLeft?: number; // Сколько секунд осталось на основной ход (показываем только текущему игроку)
  turnPercent?: number;     // 0..100 — для прогресс-кольца Phase 1 вокруг аватара
  // Phase 2: таймбанк-фаза текущего игрока. Когда != null/undefined, основной таймер уже истёк.
  // Рисуется отдельным индикатором (оранжевый), turnSecondsLeft в это время скрыт.
  timebankSecondsLeft?: number;
  timebankPercent?: number; // 0..100 — для прогресс-кольца Phase 2 вокруг аватара
  timebankEnabled?: boolean; // показывать ли вообще таймбанк-инфу (включён ли на столе)
  // Если true — D/SB/BB-бейдж внутри плашки не рисуется (родитель рендерит его «на столе»).
  hideRoleBadge?: boolean;
}


const PlayerSeatImpl = ({
  player,
  isSelf,
  isCurrent,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isWinner,
  showHand,
  faceStyle,
  backStyle,
  cardColors,
  bigBlind,
  displayMode,
  winningCards,
  turnSecondsLeft,
  turnPercent,
  timebankSecondsLeft,
  timebankPercent,
  timebankEnabled,
  hideRoleBadge,
}: PlayerSeatProps) => {
  const avatarGrad = avatarColor(player.username);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={'flex items-end gap-1' + (isCurrent ? ' is-current' : '')}
    >
      {/* Карты — слева от плашки. На showdown winning-пятёрка поднимается + золотое свечение,
          проигравшие/невошедшие — приглушаются (dim) чтобы выделить чьи карты выиграли. */}
      {player.cards.length > 0 && (
        <div className="flex gap-0.5">
          {player.cards.map((c, i) => {
            const inWinningCombo =
              !!winningCards?.some((w) => w.suit === c.suit && w.rank === c.rank);
            const showdownActive = showHand && !!winningCards && winningCards.length > 0;
            const highlight = isWinner && showHand && inWinningCombo;
            const dim = showdownActive && !highlight;
            return (
              <Card
                key={i}
                card={showHand ? c : undefined}
                faceStyle={faceStyle}
                backStyle={backStyle}
                colorScheme={cardColors}
                size="sm"
                delay={i * 0.1}
                highlight={highlight}
                dim={dim}
              />
            );
          })}
        </div>
      )}

      {/* Блок инфы игрока — пульс для active игрока через CSS-анимацию `.active-turn-pulse`
          (вынесена в index.css, GPU-friendly box-shadow keyframe вместо framer infinite loop). */}
      <div
        className={
          'player-info-block relative flex items-center gap-2 px-3 py-1.5 rounded-2xl backdrop-blur-md ' +
          (isCurrent ? 'active-turn-pulse ' : '') +
          (isWinner
            ? 'bg-yellow-500/30 ring-2 ring-yellow-400'
            : isCurrent
            ? 'bg-black/60 ring-2 ring-poker-gold'
            : player.disconnected
            ? 'bg-black/40 opacity-60 grayscale ring-1 ring-orange-500/40'
            : player.isFolded
            ? 'bg-black/40 opacity-50'
            : 'bg-black/50 ring-1 ring-white/10')
        }
      >
        {/* Аватар с прогресс-кольцом таймера (Phase 1 или Phase 2) — кольцо рисуется
            только когда таймер активен (передан percent + secondsLeft). */}
        <div className="player-avatar-wrap relative w-10 h-10 shrink-0">
          <div
            className={
              'w-10 h-10 rounded-full bg-gradient-to-br ' +
              avatarGrad +
              ' shadow-md overflow-hidden'
            }
          >
            <ReactNiceAvatar
              className="w-full h-full"
              shape="circle"
              {...avatarConfig(player.id)}
            />
          </div>
          {typeof timebankPercent === 'number' && typeof timebankSecondsLeft === 'number' ? (
            <TurnProgressRing
              size={40}
              percent={timebankPercent}
              secondsLeft={timebankSecondsLeft}
              variant="timebank"
            />
          ) : typeof turnPercent === 'number' && typeof turnSecondsLeft === 'number' ? (
            <TurnProgressRing
              size={40}
              percent={turnPercent}
              secondsLeft={turnSecondsLeft}
              variant={turnSecondsLeft <= 5 ? 'turn-urgent' : 'turn'}
            />
          ) : null}
        </div>

        <div className="flex flex-col leading-tight">
          <span className={'text-sm font-semibold ' + (isSelf ? 'text-poker-gold' : 'text-white')}>
            {player.username}
            {isSelf && <span className="text-xs text-gray-400 ml-1">(вы)</span>}
          </span>
          <span className="text-xs text-gray-300">
            {formatChips(player.chips, bigBlind, displayMode)}
          </span>
        </div>

        {/* Бейдж роли: приоритет D > SB > BB. В heads-up D=SB — показываем только D
            (chip-stack соседнего игрока с BB-суммой однозначно даёт понять, кто BB).
            hideRoleBadge=true — родитель сам рендерит бейдж «на столе» перед игроком. */}
        {!hideRoleBadge && (() => {
          const role = isDealer ? 'D' : isSmallBlind ? 'SB' : isBigBlind ? 'BB' : null;
          if (!role) return null;
          const grad = isDealer
            ? 'from-orange-400 to-orange-600 ring-orange-900/40'
            : isSmallBlind
            ? 'from-sky-400 to-sky-600 ring-sky-900/40'
            : 'from-purple-400 to-purple-600 ring-purple-900/40';
          return (
            <div
              className={
                'absolute -top-2 -right-2 min-w-[24px] h-6 px-1 rounded-full bg-gradient-to-br ' +
                grad +
                ' text-white text-[10px] font-black flex items-center justify-center shadow ring-2'
              }
            >
              {role}
            </div>
          );
        })()}

        {/* Таймер хода рисуется как кольцо вокруг аватара (см. TurnProgressRing выше) —
            тут больше не дублируем число. */}

        {/* Запас таймбанка — мелкий бейдж у нижнего края плашки, виден всегда (если включён на столе).
            При timebank=0 — серый «⏳ 0» (нет запаса), при >0 — оранжевый. Помогает понять,
            что таймбанк уже исчерпан и Phase 2 не запустится. Прячется во время самой
            таймбанк-фазы, чтобы не дублировать большой индикатор сверху. */}
        {timebankEnabled &&
          typeof player.timebank === 'number' &&
          typeof timebankSecondsLeft !== 'number' && (
            <div
              title={player.timebank > 0 ? 'Таймбанк' : 'Таймбанк исчерпан'}
              className={
                'absolute -bottom-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold border flex items-center justify-center ' +
                (player.timebank > 0
                  ? 'bg-orange-500/30 text-orange-200 border-orange-400/40'
                  : 'bg-white/5 text-white/40 border-white/15')
              }
            >
              ⏳{player.timebank}
            </div>
          )}

        {player.isFolded && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-bold bg-black/40 rounded-2xl">
            FOLD
          </div>
        )}

        {player.disconnected && !player.isFolded && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-orange-600/90 text-white text-[10px] font-bold shadow whitespace-nowrap">
            🔌 откл.
          </div>
        )}
      </div>
    </motion.div>
  );
};

// memo — пропускаем ре-рендеры от родительского тикера (200ms) для неактивных seat'ов.
// turnSecondsLeft/turnPercent у inactive игроков = undefined (стабильно), shallow compare скипнет.
export const PlayerSeat = memo(PlayerSeatImpl);

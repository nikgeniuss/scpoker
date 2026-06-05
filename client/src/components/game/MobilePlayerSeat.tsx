// Mobile-вариант seat-карточки игрока для овального layout (плану Plan-агент §1-§4).
// Структура (сверху вниз): hole-cards overlay (рубашки/face), аватар с TurnRing и флагом,
// плашка username+chips, бейдж D/SB/BB, индикаторы fold/disconnected/timebank, bubble сверху.

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from './Card';
import type { CardData } from './Card';
import { avatarColor } from './seatColors';
import type { PlayerView } from './PlayerSeat';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../../utils/avatar';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
import type { CardColorScheme } from '../../config/cardColors';
import { TurnProgressRing } from './TurnProgressRing';
import { ActionBubble } from './ActionBubble';
import { EmojiBubble } from './EmojiBubble';

interface ActionBubbleData {
  key: number;
  action: string;
  amount?: number;
}

interface EmojiBubbleData {
  key: number;
  emoji: string;
}

interface MobilePlayerSeatProps {
  player: PlayerView & { country?: string };
  isMe: boolean;
  isCurrent: boolean;
  isWinner: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  // Карты в раздаче (preflop/flop/turn/river) — рисуем рубашки даже если cards=[]
  // (сервер не отдаёт карты соперников клиенту, см. CLAUDE.md §8.2).
  hasCardsInHand: boolean;
  showHand: boolean; // true на showdown или peekOn — рисуем лицом, иначе рубашкой
  faceStyle: string;
  backStyle: string;
  cardColors?: CardColorScheme;
  bigBlind: number;
  displayMode: ChipDisplay;
  turnSecondsLeft?: number | null;
  turnPercent?: number | null;
  timebankSecondsLeft?: number | null;
  timebankPercent?: number | null;
  timebankEnabled?: boolean;
  actionBubble?: ActionBubbleData;
  emojiBubble?: EmojiBubbleData;
  winningCards?: CardData[]; // на showdown — для подсветки winning-карт
  isAdminPeek?: boolean; // true когда showHand включён через admin-peek (НЕ через showdown).
                         // Влияет на размер overlay-карт и скрытие дубля моих карт.
  // Если true — D/SB/BB-бейдж внутри плашки не рисуется (родитель рендерит «на столе»).
  hideRoleBadge?: boolean;
}

const MobilePlayerSeatImpl = ({
  player,
  isMe,
  isCurrent,
  isWinner,
  isDealer,
  isSmallBlind,
  isBigBlind,
  hasCardsInHand,
  showHand,
  faceStyle,
  backStyle,
  cardColors,
  bigBlind,
  displayMode,
  turnSecondsLeft,
  turnPercent,
  timebankSecondsLeft,
  timebankPercent,
  timebankEnabled,
  actionBubble,
  emojiBubble,
  winningCards,
  isAdminPeek,
  hideRoleBadge,
}: MobilePlayerSeatProps) => {
  const grad = avatarColor(player.username);
  const avatarPx = isMe ? 48 : 40;

  const role = isDealer ? 'D' : isSmallBlind ? 'SB' : isBigBlind ? 'BB' : null;
  const roleColor =
    role === 'D' ? 'bg-white text-black' : role === 'SB' ? 'bg-sky-500 text-white' : 'bg-purple-500 text-white';

  const avatarRing = isWinner
    ? 'ring-2 ring-yellow-400 shadow-[0_0_24px_rgba(251,191,36,0.6)]'
    : isCurrent
    ? 'ring-2 ring-poker-gold'
    : player.disconnected
    ? 'ring-1 ring-orange-500/60'
    : 'ring-1 ring-white/15';

  const isWinningCard = (c: CardData) =>
    !!winningCards && winningCards.some((w) => w.suit === c.suit && w.rank === c.rank);

  return (
    <div
      className={
        'player-info-block relative flex flex-col items-center gap-1 ' +
        (isCurrent ? 'is-current ' : '') +
        (player.isFolded ? 'opacity-50 grayscale ' : '')
      }
    >
      {/* Bubble сверху (emoji + action) */}
      {(actionBubble || emojiBubble) && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none z-30">
          <AnimatePresence mode="popLayout">
            {emojiBubble && <EmojiBubble key={'e-' + emojiBubble.key} emoji={emojiBubble.emoji} />}
            {actionBubble && (
              <ActionBubble
                key={'a-' + actionBubble.key}
                action={actionBubble.action}
                amount={actionBubble.amount}
                bigBlind={bigBlind}
                displayMode={displayMode}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Overlay face-up карт центрирован на аватаре. Размер sm — компактно,
          не перекрывает соседние плашки на 9-max столе. Winning-пятёрка
          поднимается lift'ом (без свечения), остальные dim'ятся на showdown.
          Для меня в admin-peek overlay не рендерим — мои карты уже видны в bottom-блоке. */}
      {hasCardsInHand && !player.isFolded && showHand && !(isAdminPeek && isMe) && (
        <div
          className="absolute z-30 flex gap-0.5 pointer-events-none"
          style={{
            left: '50%',
            top: avatarPx / 2,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {[0, 1].map((i) => {
            const c = player.cards[i];
            if (!c) return null;
            const inWinningCombo = !!winningCards && isWinningCard(c);
            const showdownActive = !!winningCards && winningCards.length > 0;
            const highlight = isWinner && inWinningCombo;
            const dim = showdownActive && !highlight;
            return (
              <Card
                key={i}
                card={c}
                faceStyle={faceStyle}
                backStyle={backStyle}
                colorScheme={cardColors}
                size="sm"
                delay={i * 0.05}
                highlight={highlight}
                dim={dim}
              />
            );
          })}
        </div>
      )}

      {/* ME normal-play карты НЕ рендерятся внутри seat — они вынесены в GameRoom
          как fixed-блок над ActionPanel'ом (anchor to top edge of action box). */}

      {/* Аватар */}
      <div className="player-avatar-wrap relative shrink-0" style={{ width: avatarPx, height: avatarPx }}>
        <div
          className={
            'w-full h-full rounded-full bg-gradient-to-br overflow-hidden ' +
            grad +
            ' shadow ' +
            avatarRing
          }
        >
          <ReactNiceAvatar
            className="w-full h-full"
            shape="circle"
            {...avatarConfig(player.id)}
          />
        </div>

        {/* Turn progress ring (Phase 1 или Phase 2) */}
        {isCurrent && timebankSecondsLeft != null && timebankPercent != null ? (
          <TurnProgressRing
            size={avatarPx}
            percent={timebankPercent}
            secondsLeft={timebankSecondsLeft}
            variant="timebank"
            strokeWidth={2.5}
          />
        ) : isCurrent && turnSecondsLeft != null && turnPercent != null ? (
          <TurnProgressRing
            size={avatarPx}
            percent={turnPercent}
            secondsLeft={turnSecondsLeft}
            variant={turnSecondsLeft <= 5 ? 'turn-urgent' : 'turn'}
            strokeWidth={2.5}
          />
        ) : null}
      </div>

      {/* Плашка username + chips */}
      <div className="mobile-seat-nameplate flex flex-col items-center leading-tight">
        <span
          className={
            'text-[10px] font-semibold truncate max-w-[78px] ' +
            (isMe ? 'text-amber-300' : 'text-white')
          }
        >
          {player.username}
        </span>
        <span className="text-[10px] font-black text-amber-300 tabular-nums">
          {formatChips(player.chips, bigBlind, displayMode)}
        </span>
      </div>

      {/* Opponent рубашки в раздаче — маленькие 18×26 ПОД плашкой, side-by-side без веера. */}
      {hasCardsInHand && !player.isFolded && !showHand && !isMe && (
        <div className="flex gap-0.5 mt-0.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="w-[18px] h-[26px] rounded-sm ring-1 ring-white/30 shadow-sm"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 4px), linear-gradient(135deg, #1e40af, #1e3a8a)',
              }}
            />
          ))}
        </div>
      )}

      {/* FOLD pill НАД аватаром (для me — низ занят fixed-cards блоком) */}
      {player.isFolded && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600/85 text-white text-[9px] font-bold px-1.5 py-0 rounded-full shadow whitespace-nowrap z-10">
          Фолд
        </div>
      )}

      {/* Disconnected indicator (если не fold — иначе fold pill уже занят) */}
      {player.disconnected && !player.isFolded && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600/85 text-white text-[9px] font-bold px-1.5 py-0 rounded-full shadow whitespace-nowrap z-10">
          🔌
        </div>
      )}

      {/* Бейдж D/SB/BB — в правом верхнем углу плашки.
          hideRoleBadge=true — родитель рисует бейдж «на столе» перед игроком. */}
      {!hideRoleBadge && role && (
        <div
          className={
            'absolute top-0 right-0 -translate-y-1 translate-x-1 min-w-[16px] h-4 px-0.5 rounded-full text-[8px] font-black flex items-center justify-center shadow ' +
            roleColor
          }
        >
          {role}
        </div>
      )}

      {/* Timebank индикатор — в левом верхнем углу плашки */}
      {timebankEnabled && typeof player.timebank === 'number' && !(isCurrent && timebankSecondsLeft != null) && (
        <div
          title={player.timebank > 0 ? 'Таймбанк' : 'Таймбанк исчерпан'}
          className={
            'absolute top-0 left-0 -translate-y-1 -translate-x-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-bold border flex items-center justify-center ' +
            (player.timebank > 0
              ? 'bg-orange-500/30 text-orange-200 border-orange-400/40'
              : 'bg-white/5 text-white/40 border-white/15')
          }
        >
          {player.timebank}
        </div>
      )}

      {/* Winner overlay — золотой glow поверх плашки */}
      {isWinner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 pointer-events-none rounded-md bg-yellow-500/15"
        />
      )}
    </div>
  );
};

export const MobilePlayerSeat = memo(MobilePlayerSeatImpl);

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
import type { CardDeck } from '../../config/cardDeck';
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
  deck?: CardDeck;
  bigBlind: number;
  displayMode: ChipDisplay;
  turnSecondsLeft?: number | null;
  turnPercent?: number | null;
  timebankSecondsLeft?: number | null;
  timebankPercent?: number | null;
  actionBubble?: ActionBubbleData;
  emojiBubble?: EmojiBubbleData;
  winningCards?: CardData[]; // на showdown — для подсветки winning-карт
  winAmount?: number; // сколько выиграл (showdown) — показываем «+сумма»
  handName?: string | null; // имя победной комбинации (showdown) — подпись под плашкой
  isAdminPeek?: boolean; // true когда showHand включён через admin-peek (НЕ через showdown).
                         // Влияет на размер overlay-карт и скрытие дубля моих карт.
  // Если true — D/SB/BB-бейдж внутри плашки не рисуется (родитель рендерит «на столе»).
  hideRoleBadge?: boolean;
  showHint?: boolean; // показывать подсказку комбинации у чужих аватаров (своя — в блоке карт GameRoom)
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
  deck,
  bigBlind,
  displayMode,
  turnSecondsLeft,
  turnPercent,
  timebankSecondsLeft,
  timebankPercent,
  actionBubble,
  emojiBubble,
  winningCards,
  winAmount,
  handName,
  isAdminPeek,
  hideRoleBadge,
  showHint,
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

      {/* face-up overlay только для себя (isMe) на showdown — карты противника веером в player-avatar-wrap */}
      {isMe && hasCardsInHand && !player.isFolded && showHand && !isAdminPeek && (
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
                deck={deck}
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

      {/* Аватар — для «меня» собственную аватарку не показываем (видеть её незачем);
          таймер своего хода теперь рисуется рамкой вокруг моих карт (см. GameRoom). */}
      {!isMe && (
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

        {/* Карты противника веером поверх аватарки */}
        {hasCardsInHand && !player.isFolded && (
          <div className="absolute inset-0 pointer-events-none" style={showHand ? { zIndex: 35 } : undefined}>
            {showHand && player.cards.length > 0
              ? player.cards.map((c, i) => {
                  const total = player.cards.length;
                  const angle = total <= 1 ? 0 : (i / (total - 1) - 0.5) * 24;
                  const inWinningCombo = isWinningCard(c);
                  const showdownActive = !!winningCards && winningCards.length > 0;
                  const highlight = isWinner && inWinningCombo;
                  const dim = showdownActive && !highlight;
                  return (
                    <div key={i} className="absolute" style={{ bottom: 0, left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center', zIndex: i }}>
                      <Card card={c} faceStyle={faceStyle} backStyle={backStyle} deck={deck} size="sm" delay={i * 0.05} highlight={highlight} dim={dim} />
                    </div>
                  );
                })
              : [0, 1].map((i) => {
                  const angle = (i / 1 - 0.5) * 24;
                  return (
                    <div key={i} className="absolute" style={{ bottom: 0, left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center', zIndex: i }}>
                      <Card faceStyle={faceStyle} backStyle={backStyle} deck={deck} size="sm" delay={i * 0.05} />
                    </div>
                  );
                })
            }
          </div>
        )}
        {/* shownCards соперника веером */}
        {!hasCardsInHand && player.shownCards?.some(Boolean) && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 35 }}>
            {player.shownCards!.map((c, i) => {
              const total = player.shownCards!.length;
              const angle = total <= 1 ? 0 : (i / (total - 1) - 0.5) * 24;
              return (
                <div key={i} className="absolute" style={{ bottom: 0, left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center', zIndex: i }}>
                  <Card card={c ?? undefined} faceStyle={faceStyle} backStyle={backStyle} deck={deck} size="sm" delay={i * 0.05} />
                </div>
              );
            })}
          </div>
        )}

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
      )}

      {/* Плашка username + chips */}
      <div className="mobile-seat-nameplate flex flex-col items-center leading-tight">
        {!isMe && (
          <span className="text-[10px] font-semibold truncate max-w-[78px] text-white">
            {player.displayName || player.username}
          </span>
        )}
        {/* Мой стек на мобиле показан над картами (GameRoom), в плашке seat'а — только у соперников. */}
        {!isMe && (
          <span className="text-[10px] font-black text-amber-300 tabular-nums">
            {formatChips(player.chips, bigBlind, displayMode)}
          </span>
        )}
        {/* Подсказка комбинации у соперника (по тумблеру; для админа — видит чужие). Своя — в блоке карт. */}
        {showHint && !isMe && !player.isFolded && player.handHint && (
          <span className="text-[8px] font-semibold text-emerald-300/90 leading-tight truncate max-w-[80px] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {player.handHint}
          </span>
        )}
      </div>


      {/* FOLD pill НАД аватаром (для me — низ занят fixed-cards блоком) */}
      {player.isFolded && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-red-400 text-[10px] font-black whitespace-nowrap z-10 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          Фолд
        </div>
      )}

      {/* Disconnected indicator (если не fold — иначе fold pill уже занят) */}
      {player.disconnected && !player.isFolded && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[12px] whitespace-nowrap z-10 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.9))]">
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

      {/* Winner overlay — золотой glow + «WIN +сумма» над картами + комбинация под плашкой */}
      {isWinner && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 pointer-events-none rounded-md bg-yellow-500/15"
          />
          {/* WIN + сумма — золотой бейдж над аватаром/картами (не перекрывает сами карты) */}
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-40 text-amber-300 text-[12px] font-black whitespace-nowrap pointer-events-none tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
          >
            WIN{typeof winAmount === 'number' && winAmount > 0 ? ' +' + formatChips(winAmount, bigBlind, displayMode) : ''}
          </motion.div>
          {/* Комбинация — под плашкой */}
          {handName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-40 text-yellow-200 text-[9px] font-bold whitespace-nowrap pointer-events-none max-w-[120px] truncate [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
            >
              {handName}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};

export const MobilePlayerSeat = memo(MobilePlayerSeatImpl);

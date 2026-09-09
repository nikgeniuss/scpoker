import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import type { CardData } from './Card';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
import type { CardDeck } from '../../config/cardDeck';
import { TurnProgressRing } from './TurnProgressRing';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../../utils/avatar';
import { avatarColor } from './seatColors';
import { frameRingClass } from '../../config/cosmetics';

export interface PlayerView {
  id: string;
  username: string;
  displayName?: string; // имя из Telegram — показываем вместо username
  avatar?: string; // выбранный seed аватара (из AVATAR_PRESETS); '' / не задан = фоллбэк на id
  frame?: string;  // ключ стиля рамки аватара (инвентарь косметики, ROADMAP §10.21.11)
  title?: string;  // текст титула под ником (инвентарь косметики, ROADMAP §10.21.11)
  chips: number;
  cards: CardData[];
  isFolded: boolean;
  currentBet: number;
  position: number;
  disconnected?: boolean;
  timebank?: number; // оставшиеся секунды таймбанка (для подписи под ником, если timebankEnabled)
  handHint?: string;  // подсказка: название текущей комбинации (своя; у админа — и чужие)
  winChance?: number; // 0..100 — шанс выиграть (только своё место)
  shownCards?: (CardData | null)[]; // добровольно показанные карты соперника (тап после раздачи)
  revealedCards?: number[];         // индексы показанных карт (для своего UI)
  hudStats?: { vpip: number; pfr: number; hands: number }; // HUD-lite
  hudLockedHands?: number; // платный режим без подписки: пришло только число рук (§10.21.13)
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
  deck?: CardDeck;
  bigBlind: number;
  displayMode: ChipDisplay;
  winningCards?: CardData[]; // На шоудауне у победителя — карты, входящие в выигрышную комбинацию
  // Добровольный показ своих карт после раздачи — карты героя становятся кнопками на своём
  // месте (раньше GameRoom рисовал для этого отдельный набор, и они накладывались).
  onShowCard?: (index: number) => void;
  showCardPrompt?: string;
  // Админ-метка «это бот»: вместо аватарки — белый кружок с красной «B». Передаётся ТОЛЬКО
  // админу (родитель гейтит по isAdmin) — обычный игрок не должен отличать ботов от людей.
  isBotSeat?: boolean;
  winAmount?: number; // Сколько выиграл (showdown) — «+сумма»
  handName?: string | null; // Имя победной комбинации (showdown) — подпись под плашкой
  turnSecondsLeft?: number; // Сколько секунд осталось на основной ход (показываем только текущему игроку)
  turnPercent?: number;     // 0..100 — для прогресс-кольца Phase 1 вокруг аватара
  // Phase 2: таймбанк-фаза текущего игрока. Когда != null/undefined, основной таймер уже истёк.
  // Рисуется отдельным индикатором (оранжевый), turnSecondsLeft в это время скрыт.
  timebankSecondsLeft?: number;
  timebankPercent?: number; // 0..100 — для прогресс-кольца Phase 2 вокруг аватара
  timebankEnabled?: boolean; // показывать ли вообще таймбанк-инфу (включён ли на столе)
  // Если true — D/SB/BB-бейдж внутри плашки не рисуется (родитель рендерит его «на столе»).
  hideRoleBadge?: boolean;
  showHint?: boolean; // показывать подсказку комбинации/шанса (тумблер настроек)
  onAvatarClick?: (player: PlayerView) => void;
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
  deck,
  bigBlind,
  displayMode,
  winningCards,
  onShowCard,
  showCardPrompt,
  isBotSeat,
  winAmount,
  handName,
  turnSecondsLeft,
  turnPercent,
  timebankSecondsLeft,
  timebankPercent,
  timebankEnabled,
  hideRoleBadge,
  showHint,
  onAvatarClick,
}: PlayerSeatProps) => {
  const { t } = useTranslation();
  const avatarGrad = avatarColor(player.username);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={'relative flex items-end gap-1' + (isCurrent ? ' is-current' : '')}
    >
      {/* Winner: «WIN +сумма» сверху и подпись комбинации снизу (showdown) */}
      {isWinner && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-xs font-black shadow-lg ring-1 ring-yellow-200/70 whitespace-nowrap pointer-events-none tabular-nums"
          >
            WIN{typeof winAmount === 'number' && winAmount > 0 ? ' +' + formatChips(winAmount, bigBlind, displayMode) : ''}
          </motion.div>
          {handName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-black/75 ring-1 ring-yellow-400/50 text-yellow-200 text-[10px] font-bold whitespace-nowrap pointer-events-none max-w-[160px] truncate"
            >
              {handName}
            </motion.div>
          )}
        </>
      )}
      {/* Свои карты — слева от плашки в ряд. В окне добровольного показа те же карты становятся
          кнопками (тап раскрывает карту сопернику) — на своём месте, без второго набора. */}
      {isSelf && player.cards.length > 0 && (
        <div className="flex flex-col items-center gap-0.5">
          {onShowCard && showCardPrompt && (
            <span className="text-white/75 text-[9px] font-semibold whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
              {showCardPrompt}
            </span>
          )}
          <div className="flex gap-0.5">
          {player.cards.map((c, i) => {
            const inWinningCombo =
              !!winningCards?.some((w) => w.suit === c.suit && w.rank === c.rank);
            const showdownActive = showHand && !!winningCards && winningCards.length > 0;
            const highlight = isWinner && showHand && inWinningCombo;
            const dim = showdownActive && !highlight;
            const card = (
              <Card
                card={showHand ? c : undefined}
                faceStyle={faceStyle}
                backStyle={backStyle}
                deck={deck}
                size="sm"
                delay={i * 0.1}
                highlight={highlight}
                dim={dim}
              />
            );
            if (!onShowCard) return <div key={i}>{card}</div>;
            const shown = !!player.revealedCards?.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={shown}
                onClick={() => onShowCard(i)}
                className={'relative rounded ' + (shown ? 'ring-2 ring-emerald-400 rounded-md' : 'hover:-translate-y-0.5 transition-transform')}
              >
                {card}
                {shown && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[8px] font-black flex items-center justify-center shadow">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
      )}

      {/* Свои добровольно показанные карты (тап после раздачи) — слева в ряд. */}
      {isSelf && player.cards.length === 0 && player.shownCards && player.shownCards.some(Boolean) && (
        <div className="flex gap-0.5">
          {player.shownCards.map((c, i) => (
            <Card
              key={i}
              card={c ?? undefined}
              faceStyle={faceStyle}
              backStyle={backStyle}
              deck={deck}
              size="sm"
              delay={i * 0.05}
            />
          ))}
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
            ? 'bg-black/40 opacity-65'
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
              ' shadow-md overflow-hidden' +
              (!isSelf && onAvatarClick ? ' cursor-pointer' : '') +
              ' ' + frameRingClass(player.frame)
            }
            onClick={!isSelf && onAvatarClick ? () => onAvatarClick(player) : undefined}
          >
            {isBotSeat ? (
              <div className="w-full h-full bg-white flex items-center justify-center">
                <span className="text-red-600 font-black text-lg leading-none">B</span>
              </div>
            ) : (
              <ReactNiceAvatar
                className="w-full h-full"
                shape="circle"
                {...avatarConfig(player.avatar || player.id)}
              />
            )}
          </div>
          {/* Карты противника веером поверх аватарки */}
          {!isSelf && player.cards.length > 0 && (
            <div className="absolute inset-0 pointer-events-none" style={showHand ? { zIndex: 25 } : undefined}>
              {player.cards.map((c, i) => {
                const total = player.cards.length;
                const angle = total <= 1 ? 0 : (i / (total - 1) - 0.5) * 24;
                const spreadX = total <= 1 ? 0 : (i - (total - 1) / 2) * 14;
                const inWinningCombo = !!winningCards?.some((w) => w.suit === c.suit && w.rank === c.rank);
                const showdownActive = showHand && !!winningCards && winningCards.length > 0;
                const highlight = isWinner && showHand && inWinningCombo;
                const dim = showdownActive && !highlight;
                return (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      bottom: 0,
                      left: '50%',
                      transform: `translateX(calc(-50% + ${spreadX}px)) rotate(${angle}deg)`,
                      transformOrigin: 'bottom center',
                      zIndex: i,
                    }}
                  >
                    <Card
                      card={showHand ? c : undefined}
                      faceStyle={faceStyle}
                      backStyle={backStyle}
                      deck={deck}
                      size="sm"
                      delay={i * 0.1}
                      highlight={highlight}
                      dim={dim}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {/* Добровольно показанные карты противника — тоже веером */}
          {!isSelf && player.cards.length === 0 && player.shownCards?.some(Boolean) && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
              {player.shownCards!.map((c, i) => {
                const total = player.shownCards!.length;
                const angle = total <= 1 ? 0 : (i / (total - 1) - 0.5) * 24;
                const spreadX = total <= 1 ? 0 : (i - (total - 1) / 2) * 14;
                return (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      bottom: 0,
                      left: '50%',
                      transform: `translateX(calc(-50% + ${spreadX}px)) rotate(${angle}deg)`,
                      transformOrigin: 'bottom center',
                      zIndex: i,
                    }}
                  >
                    <Card
                      card={c ?? undefined}
                      faceStyle={faceStyle}
                      backStyle={backStyle}
                      deck={deck}
                      size="sm"
                      delay={i * 0.05}
                    />
                  </div>
                );
              })}
            </div>
          )}
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
          {!isSelf && (
            <span className="text-sm font-semibold text-white">
              {player.displayName || player.username}
            </span>
          )}
          {!isSelf && player.title && (
            <span className="text-[9px] font-bold text-amber-300/90 leading-tight truncate max-w-[90px]">
              {player.title}
            </span>
          )}
          <span className="text-xs text-gray-300">
            {formatChips(player.chips, bigBlind, displayMode)}
          </span>
          {/* Подсказка комбинации/шанса (по тумблеру). winChance есть только у своего места. */}
          {showHint && !player.isFolded && player.handHint && (
            <span className="text-[9px] font-semibold text-emerald-300/90 leading-tight whitespace-nowrap">
              {player.handHint}
              {typeof player.winChance === 'number' ? ' · ' + player.winChance + '%' : ''}
            </span>
          )}
          {/* HUD-lite: VPIP/PFR (достаточно ≥10 рук). */}
          {!isSelf && player.hudStats && player.hudStats.hands >= 10 && (
            <span className="text-[8px] text-white/30 leading-tight tabular-nums">
              {player.hudStats.vpip}/{player.hudStats.pfr}
            </span>
          )}
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
              title={player.timebank > 0 ? t('playerSeat.timebank') : t('playerSeat.timebankExhausted')}
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
            🔌 {t('playerSeat.disconnected')}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// memo — пропускаем ре-рендеры от родительского тикера (200ms) для неактивных seat'ов.
// turnSecondsLeft/turnPercent у inactive игроков = undefined (стабильно), shallow compare скипнет.
export const PlayerSeat = memo(PlayerSeatImpl);

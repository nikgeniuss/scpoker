import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { LogOut, Settings, Smile, Info, Coins } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import type { GamePhase } from '@poker-room/shared';
import { Card } from '../components/game/Card';
import { PlayerSeat } from '../components/game/PlayerSeat';
import { ChipStack } from '../components/game/ChipStack';
import { ActionPanel } from '../components/game/ActionPanel';
import { BetPresetsModal } from '../components/game/BetPresetsModal';
import { TableInfoModal } from '../components/game/TableInfoModal';
import { ActionBubble } from '../components/game/ActionBubble';
import { EmojiBubble } from '../components/game/EmojiBubble';
import { EmojiPalette } from '../components/game/EmojiPalette';
import { MobilePlayerSeat } from '../components/game/MobilePlayerSeat';
import { DEFAULT_DESIGN } from '../config/design';
import { loadBetPresets, saveBetPresets } from '../config/betPresets';
import type { BetPresets } from '../config/betPresets';
import { loadChipDisplay, saveChipDisplay, formatChips } from '../config/chipFormat';
import type { ChipDisplay } from '../config/chipFormat';
import { loadCardColors, saveCardColors } from '../config/cardColors';
import type { CardColorScheme } from '../config/cardColors';
import type { CardData } from '../components/game/Card';
import type { DesignConfig } from '../config/design';
import { useGameRoom } from '../hooks/useGameRoom';
import { useEphemeralBubbles } from '../hooks/useEphemeralBubbles';
import { useTableClock } from '../hooks/useTableClock';
import { useTableGeometry } from '../hooks/useTableGeometry';
import { computeBlindSeats } from '../utils/blinds';

// Админ-кнопки за столом — lazy-чанк, грузится только для админа (код не в бандле игрока).
const AdminTableControls = lazy(() => import('../components/admin/AdminTableControls'));

// GameState/GamePhase — из общего контракта shared (см. импорт выше).

const FELT_CLASS: Record<string, string> = {
  green: 'bg-[radial-gradient(ellipse_at_center,_#0e5e2e_0%,_#0a3d1d_70%,_#06281a_100%)]',
  burgundy: 'bg-[radial-gradient(ellipse_at_center,_#7a1f2e_0%,_#4b121e_70%,_#2a0a11_100%)]',
  blue: 'bg-[radial-gradient(ellipse_at_center,_#1e3a8a_0%,_#162a63_70%,_#0c1840_100%)]',
  black: 'bg-[radial-gradient(ellipse_at_center,_#2a2a2a_0%,_#171717_70%,_#0a0a0a_100%)]',
};

const PHASE_LABEL: Record<GamePhase, string> = {
  waiting: 'Ожидание',
  preflop: 'Префлоп',
  flop: 'Флоп',
  turn: 'Тёрн',
  river: 'Ривер',
  showdown: 'Шоудаун',
};

export const GameRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const userChips = useAuthStore((s) => s.user?.chips);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // Транспорт + ядро состояния стола (подписки, реджойн, эмиттеры)
  const { state, winners, winningCards, countdownEndsAt, sendAction, leave, sendEmoji } =
    useGameRoom(roomId);
  // Эфемерные пузыри действий/эмодзи над игроками
  const { actionBubbles, emojiBubbles } = useEphemeralBubbles();

  // Admin-peek toggle: при on сервер шлёт нам карты всех игроков + futureBoard.
  // По умолчанию off — админ играет «честно», peek включается осознанно.
  const [peekOn, setPeekOn] = useState(false);

  const [design, setDesign] = useState<DesignConfig>(DEFAULT_DESIGN);
  const [betPresets, setBetPresets] = useState<BetPresets>(() => loadBetPresets());
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [chipDisplay, setChipDisplay] = useState<ChipDisplay>(() => loadChipDisplay());
  const [cardColors, setCardColors] = useState<CardColorScheme>(() => loadCardColors());
  const [emojiPaletteOpen, setEmojiPaletteOpen] = useState(false);

  useEffect(() => {
    fetch(API_URL + '/design')
      .then((r) => r.json())
      .then((d) => setDesign({ ...DEFAULT_DESIGN, ...d }))
      .catch(() => {});
  }, []);

  // Производные секунды/проценты таймеров (единый тикер now)
  const { countdownSec, turnSecondsLeft, timebankSecondsLeft, turnPercent, timebankPercent } =
    useTableClock(state, countdownEndsAt);

  const myId = userId;
  const me = useMemo(() => state?.players.find((p) => p.id === myId) ?? null, [state, myId]);
  const currentPlayerId = useMemo(
    () => (state ? state.players[state.currentPlayerIndex]?.id ?? null : null),
    [state],
  );
  const dealerPlayerId = useMemo(
    () => (state ? state.players[state.dealerIndex]?.id ?? null : null),
    [state],
  );
  // SB/BB по тому же правилу, что и на сервере (computeBlindSeats — единая формула, §9.3-E).
  const { sbPlayerId, bbPlayerId } = useMemo(() => {
    if (!state) return { sbPlayerId: null, bbPlayerId: null };
    const seats = computeBlindSeats(state.players.length, state.dealerIndex);
    if (!seats) return { sbPlayerId: null, bbPlayerId: null };
    return {
      sbPlayerId: state.players[seats.sbIndex]?.id ?? null,
      bbPlayerId: state.players[seats.bbIndex]?.id ?? null,
    };
  }, [state]);

  // Рассадка: desktop эллипс + mobile presets
  const { seatPositions, mobileSeatPositions } = useTableGeometry(state, me);

  const isMyTurn =
    !!state &&
    !!me &&
    currentPlayerId === me.id &&
    state.phase !== 'waiting' &&
    state.phase !== 'showdown';

  const feltCls = FELT_CLASS[design.tableFelt] || FELT_CLASS.green;
  // Фирменная тема стола — оборачивает felt/rail/watermark/lighting в один пресет.
  // CSS-классы theme-classic|luxe|wood определены в client/src/index.css.
  const themeCls = 'theme-' + (design.tableTheme || 'classic');
  const isWinningCard = (c: CardData) =>
    winningCards.some((w) => w.suit === c.suit && w.rank === c.rank);
  const showHighlight = state?.phase === 'showdown' && winningCards.length > 0;
  const timebankEnabled = !!state?.timebankEnabled;

  if (!state) {
    return (
      <div className="h-[100dvh] md:h-[calc(100dvh-4rem)] flex items-center justify-center text-gray-400">
        Подключение к комнате…
      </div>
    );
  }

  return (
    <div className={'gameroom-root-mobile-clubgg relative w-full h-[100dvh] md:h-[calc(100dvh-4rem)] overflow-hidden ' + feltCls + ' ' + themeCls}>
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-2 max-w-[60vw] md:max-w-none">
          {/* Phase и roomName перенесены в центр стола (для desktop+mobile).
              На mobile Layout-navbar скрыта, поэтому balance + Admin-кнопка показаны здесь (md:hidden).
              На desktop balance/admin остаются в Layout navbar. */}
          {typeof userChips === 'number' && (
            <span
              title="Свободный банкролл"
              className="md:hidden inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold whitespace-nowrap backdrop-blur"
            >
              <Coins size={12} /> {userChips}
            </span>
          )}
          {isAdmin && (
            <Suspense fallback={null}>
              <AdminTableControls slot="nav" onOpenAdmin={() => navigate('/admin')} />
            </Suspense>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInfoModalOpen(true)}
            title="Информация о столе"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <Info size={16} />
          </button>
          {isAdmin && (
            <Suspense fallback={null}>
              <AdminTableControls slot="peek" roomId={roomId} peekOn={peekOn} setPeekOn={setPeekOn} />
            </Suspense>
          )}
          <button
            onClick={() => setEmojiPaletteOpen((v) => !v)}
            title="Реакции"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <Smile size={16} />
          </button>
          <button
            onClick={() => setPresetsModalOpen(true)}
            title="Настроить кнопки ставок"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={leave}
            title="Выйти за стола (в лобби)"
            className="flex items-center gap-1 md:px-3 md:py-1.5 justify-center w-9 h-9 md:w-auto md:h-auto rounded-xl bg-red-600/80 hover:bg-red-700 text-white text-sm font-bold"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Выйти</span>
          </button>
        </div>
      </div>

      <EmojiPalette
        open={emojiPaletteOpen}
        onClose={() => setEmojiPaletteOpen(false)}
        onPick={sendEmoji}
      />

      {/* MOBILE: theme effects — spotlight + watermark (rail/seats остаются desktop-only). */}
      <div className="md:hidden poker-spotlight absolute inset-0 pointer-events-none z-0" />
      <div className="md:hidden poker-watermark absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-0">
        SK
      </div>

      {/* Desktop: овальный стол. Обёртка ограничена снизу (bottom-56), чтобы seat-позиции
          в % считались относительно зоны над ActionPanel'ом — иначе «я»-seat на top=84%
          уезжает внутрь ActionPanel'а (~210px высотой) на FullHD-мониторах. */}
      <div className="hidden md:block absolute top-0 left-0 right-0 bottom-56">
        {/* Theme spotlight — тёплый/cyan/Tiffany световой конус на felt центре (per theme) */}
        <div className="poker-spotlight absolute inset-0 pointer-events-none z-0" />
        {/* Decorative oval rail — themed: gold/chrome/wood с nailheads */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="poker-oval-rail w-[90%] max-w-4xl aspect-[2/1]" />
        </div>
        {/* Watermark — фирменный монограмм, большой, полупрозрачный, под интерактивом */}
        <div className="poker-watermark absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
          SK
        </div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          {/* Фаза игры — переехала сюда из верхнего бара */}
          <div className="text-poker-gold text-xs font-bold uppercase tracking-widest">
            {PHASE_LABEL[state.phase]}
          </div>
          {/* Метаданные стола — серым над банком */}
          <div className="text-white/40 text-xs font-semibold tracking-wide max-w-[280px] truncate -mt-1">
            {state.roomName}
          </div>
          <div className="text-white/30 text-[11px] font-bold uppercase tracking-widest -mt-1">
            NLH: {state.smallBlind}/{state.bigBlind}
          </div>
          <motion.div
            key={state.pot}
            initial={{ scale: 0.85 }}
            animate={{ scale: 1, opacity: state.phase === 'showdown' ? 0 : 1 }}
            transition={{ opacity: { duration: 0.6 } }}
            className="text-2xl font-black text-white bg-black/50 px-4 py-1 rounded-full backdrop-blur ring-1 ring-white/10"
          >
            Pot: {formatChips(state.pot, state.bigBlind, chipDisplay)}
          </motion.div>
          <div className="flex gap-1.5 mt-2">
            {state.communityCards.map((c, i) => (
              <Card
                key={i}
                card={c}
                faceStyle={design.cardFaceStyle}
                backStyle={design.cardBackStyle}
                colorScheme={cardColors}
                size="md"
                delay={i * 0.1}
                highlight={showHighlight && isWinningCard(c)}
                dim={showHighlight && !isWinningCard(c)}
              />
            ))}
            {/* Admin-peek: будущие карты колоды — flop+turn+river заранее.
                Рендерим только те, что ещё не открыты на текущей фазе (5 минус сколько уже на борде). */}
            {peekOn && state.futureBoard && state.futureBoard.length > 0 &&
              state.futureBoard.slice(0, Math.max(0, 5 - state.communityCards.length)).map((c, i) => (
                <div key={'fut-' + i} className="opacity-40 ring-2 ring-red-500/50 rounded-md">
                  <Card
                    card={c}
                    faceStyle={design.cardFaceStyle}
                    backStyle={design.cardBackStyle}
                    colorScheme={cardColors}
                    size="md"
                    delay={0}
                  />
                </div>
              ))}
            {state.communityCards.length === 0 && state.phase !== 'waiting' && !peekOn && (
              <div className="text-white/30 text-sm italic">карты ещё не открыты</div>
            )}
          </div>
          {peekOn && (
            <div className="text-red-400/80 text-[10px] font-bold uppercase tracking-widest mt-1">
              🔮 admin-peek
            </div>
          )}
        </div>

        {/* Фишки ставок — между seat и центром. На showdown анимированно стягиваются
            к центру (имитирует «банк уезжает к победителю»). Используем чистый CSS
            transition — Framer Motion плохо интерполирует left/top в `%`-строках. */}
        {seatPositions.map(({ player, chipLeft, chipTop }) => {
          if (player.currentBet <= 0) return null;
          const isShowdown = state.phase === 'showdown';
          return (
            <div
              key={'chips-' + player.id}
              className="absolute z-10"
              style={{
                left: isShowdown ? '50%' : chipLeft + '%',
                top: isShowdown ? '50%' : chipTop + '%',
                opacity: isShowdown ? 0 : 1,
                transform: 'translate(-50%, -50%)' + (isShowdown ? ' scale(0.5)' : ' scale(1)'),
                transition: 'left 1.4s ease-in-out, top 1.4s ease-in-out, opacity 1.4s ease-in-out, transform 1.4s ease-in-out',
              }}
            >
              <ChipStack
                amount={player.currentBet}
                bigBlind={state.bigBlind}
                displayMode={chipDisplay}
                chipStyle={design.chipStyle}
              />
            </div>
          );
        })}

        {/* D/SB/BB-бейдж прижат к плашке аватара со стороны центра стола.
            Координаты dealerLeft/dealerTop = seat-position сдвинутая к центру
            на ~7% радиуса (см. seatPositions выше) — для всех игроков
            ориентация одинаковая: «к центру». */}
        {state.phase !== 'waiting' && seatPositions.map(({ player, dealerLeft, dealerTop }) => {
          const isDealer = player.id === dealerPlayerId;
          const isSB = player.id === sbPlayerId && player.id !== dealerPlayerId;
          const isBB = player.id === bbPlayerId;
          const role = isDealer ? 'D' : isSB ? 'SB' : isBB ? 'BB' : null;
          if (!role) return null;
          const grad = isDealer
            ? 'from-orange-400 to-orange-600 ring-orange-900/40'
            : isSB
            ? 'from-sky-400 to-sky-600 ring-sky-900/40'
            : 'from-purple-400 to-purple-600 ring-purple-900/40';
          return (
            <div
              key={'role-' + player.id}
              className={
                'absolute z-20 min-w-[22px] h-[22px] px-1 rounded-full bg-gradient-to-br ' +
                grad +
                ' text-white text-[10px] font-black flex items-center justify-center shadow ring-1'
              }
              style={{
                left: dealerLeft + '%',
                top: dealerTop + '%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              {role}
            </div>
          );
        })}

        {seatPositions.map(({ player, left, top }) => {
          const ab = actionBubbles[player.id];
          const eb = emojiBubbles[player.id];
          return (
            <div
              key={player.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: left + '%', top: top + '%' }}
            >
              <div className="relative">
                {/* Bubbles над аватаром */}
                {(ab || eb) && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none z-20">
                    <AnimatePresence mode="popLayout">
                      {eb && <EmojiBubble key={'e-' + eb.key} emoji={eb.emoji} />}
                      {ab && (
                        <ActionBubble
                          key={'a-' + ab.key}
                          action={ab.action}
                          amount={ab.amount}
                          bigBlind={state.bigBlind}
                          displayMode={chipDisplay}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <PlayerSeat
                  player={player}
                  isSelf={player.id === myId}
                  isCurrent={player.id === currentPlayerId && state.phase !== 'waiting' && state.phase !== 'showdown'}
                  isDealer={player.id === dealerPlayerId && state.phase !== 'waiting'}
                  isSmallBlind={player.id === sbPlayerId && state.phase !== 'waiting' && player.id !== dealerPlayerId}
                  isBigBlind={player.id === bbPlayerId && state.phase !== 'waiting'}
                  hideRoleBadge

                  isWinner={!!winners && winners.includes(player.id)}
                  showHand={player.id === myId || state.phase === 'showdown' || peekOn}
                  faceStyle={design.cardFaceStyle}
                  backStyle={design.cardBackStyle}
                  cardColors={cardColors}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                  winningCards={showHighlight ? winningCards : undefined}
                  timebankEnabled={timebankEnabled}
                  turnSecondsLeft={
                    player.id === currentPlayerId &&
                    state.phase !== 'waiting' &&
                    state.phase !== 'showdown' &&
                    turnSecondsLeft !== null
                      ? turnSecondsLeft
                      : undefined
                  }
                  turnPercent={
                    player.id === currentPlayerId &&
                    state.phase !== 'waiting' &&
                    state.phase !== 'showdown' &&
                    turnPercent !== null &&
                    timebankSecondsLeft === null
                      ? turnPercent
                      : undefined
                  }
                  timebankSecondsLeft={
                    player.id === currentPlayerId &&
                    state.phase !== 'waiting' &&
                    state.phase !== 'showdown' &&
                    timebankSecondsLeft !== null
                      ? timebankSecondsLeft
                      : undefined
                  }
                  timebankPercent={
                    player.id === currentPlayerId &&
                    state.phase !== 'waiting' &&
                    state.phase !== 'showdown' &&
                    timebankPercent !== null
                      ? timebankPercent
                      : undefined
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* MOBILE: овальный стол с seats по периметру (плана §1-§4 + design-review priorities).
          theme-clubgg на mobile-блоке принудительно — игнорируем design.tableTheme из админки.
          Расширил до inset-x-0 top-12 bottom-[128px] (был inset-x-1/top-14/bottom-[140px]) —
          овал почти касается краёв (Round 3 review приоритет 1). */}
      <div className="md:hidden theme-clubgg absolute inset-x-4 top-28 bottom-[160px] flex items-center justify-center pointer-events-none">
        <div className="poker-oval-rail relative pointer-events-auto" style={{ width: '100%', height: '100%' }}>
          {/* Layer 0: theme spotlight (overlay) */}
          <div className="poker-spotlight absolute inset-0 pointer-events-none rounded-[50%]" />

          {/* Layer 1: центр — watermark + NLH-pill + roomName сверху, pot-plate ПОД данными стола
              (иерархия "данные → банк → борд"), community-cards внизу. */}
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-[16%] gap-2 pointer-events-none z-10 px-4">
            <div className="poker-watermark poker-watermark--center select-none mt-2">SK</div>
            <div className="bg-emerald-600 text-white text-[13px] font-bold uppercase px-4 py-1 rounded-full tracking-widest shadow">
              NLH {state.smallBlind}/{state.bigBlind}
            </div>
            <div className="text-white/40 text-[10px] font-semibold tracking-wide max-w-[80%] truncate text-center">
              {state.roomName}
            </div>
            {state.pot > 0 && state.phase !== 'showdown' && (
              <div className="pot-plate-mobile">
                <div className="pot-label">Банк</div>
                <div className="pot-value">{formatChips(state.pot, state.bigBlind, chipDisplay)}</div>
              </div>
            )}
            {state.communityCards.length > 0 || (peekOn && state.futureBoard && state.futureBoard.length > 0) ? (
              <div className="flex gap-1 flex-wrap justify-center max-w-full mt-1">
                {state.communityCards.map((c, i) => (
                  <Card
                    key={i}
                    card={c}
                    faceStyle={design.cardFaceStyle}
                    backStyle={design.cardBackStyle}
                    colorScheme={cardColors}
                    size="sm"
                    delay={i * 0.1}
                    highlight={showHighlight && isWinningCard(c)}
                    dim={showHighlight && !isWinningCard(c)}
                  />
                ))}
                {/* Admin-peek mobile: будущие community карты (flop+turn+river) — пол-прозрачные с красной обводкой */}
                {peekOn && state.futureBoard && state.futureBoard.length > 0 &&
                  state.futureBoard.slice(0, Math.max(0, 5 - state.communityCards.length)).map((c, i) => (
                    <div key={'fut-' + i} className="opacity-40 ring-2 ring-red-500/50 rounded-md">
                      <Card
                        card={c}
                        faceStyle={design.cardFaceStyle}
                        backStyle={design.cardBackStyle}
                        colorScheme={cardColors}
                        size="sm"
                        delay={0}
                      />
                    </div>
                  ))}
              </div>
            ) : state.phase !== 'waiting' ? (
              <div className="text-white/30 text-[10px] italic mt-1">карты ещё не открыты</div>
            ) : null}
          </div>

          {/* Layer 2: seats по периметру овала (mobileSeatPositions, me на индексе 0 = bottom-center) */}
          {mobileSeatPositions.map(({ player, left, top }) => {
            const isCurr = player.id === currentPlayerId && state.phase !== 'waiting' && state.phase !== 'showdown';
            return (
              <div
                key={player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto"
                style={{ left: left + '%', top: top + '%' }}
              >
                <MobilePlayerSeat
                  player={player}
                  isMe={player.id === myId}
                  isCurrent={isCurr}
                  isWinner={!!winners && winners.includes(player.id)}
                  isDealer={player.id === dealerPlayerId && state.phase !== 'waiting'}
                  isSmallBlind={
                    player.id === sbPlayerId && state.phase !== 'waiting' && player.id !== dealerPlayerId
                  }
                  isBigBlind={player.id === bbPlayerId && state.phase !== 'waiting'}
                  hideRoleBadge
                  hasCardsInHand={state.phase !== 'waiting' && !player.isFolded}
                  showHand={
                    state.phase === 'showdown' ||
                    // Админ-peek: видим карты соперников
                    (peekOn && player.cards.length > 0)
                  }
                  faceStyle={design.cardFaceStyle}
                  backStyle={design.cardBackStyle}
                  cardColors={cardColors}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                  turnSecondsLeft={isCurr ? turnSecondsLeft : null}
                  turnPercent={isCurr ? turnPercent : null}
                  timebankSecondsLeft={isCurr ? timebankSecondsLeft : null}
                  timebankPercent={isCurr ? timebankPercent : null}
                  timebankEnabled={timebankEnabled}
                  actionBubble={actionBubbles[player.id]}
                  emojiBubble={emojiBubbles[player.id]}
                  winningCards={winningCards}
                  isAdminPeek={peekOn && state.phase !== 'showdown'}
                />
              </div>
            );
          })}

          {/* Layer 3: bet chips между seat и центром (z-10 < z-20 seats) */}
          {mobileSeatPositions.map(({ player, chipLeft, chipTop }) =>
            player.currentBet > 0 && state.phase !== 'showdown' ? (
              <div
                key={'chip-' + player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                style={{ left: chipLeft + '%', top: chipTop + '%' }}
              >
                <ChipStack
                  amount={player.currentBet}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                  chipStyle={design.chipStyle}
                />
              </div>
            ) : null,
          )}

          {/* Layer 4: D/SB/BB-бейдж прижат к плашке со стороны центра стола (10% пути от seat) */}
          {state.phase !== 'waiting' && mobileSeatPositions.map(({ player, dealerLeft, dealerTop }) => {
            const isDealer = player.id === dealerPlayerId;
            const isSB = player.id === sbPlayerId && player.id !== dealerPlayerId;
            const isBB = player.id === bbPlayerId;
            const role = isDealer ? 'D' : isSB ? 'SB' : isBB ? 'BB' : null;
            if (!role) return null;
            const cls =
              role === 'D'
                ? 'bg-white text-black'
                : role === 'SB'
                ? 'bg-sky-500 text-white'
                : 'bg-purple-500 text-white';
            return (
              <div
                key={'role-' + player.id}
                className={
                  'absolute -translate-x-1/2 -translate-y-1/2 z-10 min-w-[20px] h-5 px-1 rounded-full text-[9px] font-black flex items-center justify-center shadow-lg ring-1 ring-black/30 pointer-events-none ' +
                  cls
                }
                style={{ left: dealerLeft + '%', top: dealerTop + '%' }}
              >
                {role}
              </div>
            );
          })}
        </div>
      </div>


      <AnimatePresence>
        {state.phase === 'waiting' && countdownEndsAt !== null && countdownSec > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-20"
          >
            <div className="bg-black/70 backdrop-blur px-6 py-3 rounded-2xl border border-poker-gold/40 text-center">
              <div className="text-poker-gold text-xs uppercase tracking-widest">Старт через</div>
              <div className="text-5xl font-black text-white">{countdownSec}</div>
            </div>
          </motion.div>
        )}

        {state.phase === 'waiting' && countdownEndsAt === null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-xl text-gray-300 text-sm"
          >
            Ждём второго игрока…
          </motion.div>
        )}

      </AnimatePresence>

      {/* MOBILE: мои карты — fixed-блок, привязан к верхнему краю бокса ActionPanel.
          Закрытый ActionPanel ~104px от низа viewport (button 56 + p-3 padding + safe-area).
          Кладём cards bottom-[108px] чтобы низ карт сидел чуть выше top-edge action-box.
          На showdown — не рендерим (showdown-карты уже в MobilePlayerSeat overlay'е). */}
      {me && me.cards.length > 0 && state.phase !== 'showdown' && (
        <div className="md:hidden fixed bottom-[82px] left-1/2 -translate-x-1/2 z-30 flex gap-1.5 pointer-events-none scale-[0.81] origin-bottom">
          {me.cards.map((c, i) => (
            <Card
              key={i}
              card={c}
              faceStyle={design.cardFaceStyle}
              backStyle={design.cardBackStyle}
              colorScheme={cardColors}
              size="lg"
              delay={i * 0.05}
            />
          ))}
        </div>
      )}

      {me && isMyTurn && (
        <ActionPanel
          chips={me.chips}
          currentBet={state.currentBet}
          myBet={me.currentBet}
          bigBlind={state.bigBlind}
          pot={state.pot}
          phase={state.phase}
          presets={betPresets}
          displayMode={chipDisplay}
          onAction={sendAction}
        />
      )}

      {roomId && (
        <TableInfoModal
          open={infoModalOpen}
          roomId={roomId}
          myChips={me?.chips ?? 0}
          myCurrentBet={me?.currentBet ?? 0}
          displayMode={chipDisplay}
          onClose={() => setInfoModalOpen(false)}
        />
      )}

      <BetPresetsModal
        open={presetsModalOpen}
        initial={betPresets}
        initialChipDisplay={chipDisplay}
        initialCardColors={cardColors}
        onClose={() => setPresetsModalOpen(false)}
        onSave={(next, nextDisplay, nextColors) => {
          setBetPresets(next);
          saveBetPresets(next);
          setChipDisplay(nextDisplay);
          saveChipDisplay(nextDisplay);
          setCardColors(nextColors);
          saveCardColors(nextColors);
        }}
      />
    </div>
  );
};

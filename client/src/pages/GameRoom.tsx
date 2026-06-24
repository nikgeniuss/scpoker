import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings, Smile, Info, Coins, History, Eye, Zap, Trophy } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import type { GamePhase } from '@poker-room/shared';
import { Card } from '../components/game/Card';
import { PlayerSeat } from '../components/game/PlayerSeat';
import { ChipStack } from '../components/game/ChipStack';
import { CardsTurnTimer } from '../components/game/CardsTurnTimer';
import { ActionPanel } from '../components/game/ActionPanel';
import { PreSelectPanel, type PreSelectAction } from '../components/game/PreSelectPanel';
import { GameSettingsModal } from '../components/game/GameSettingsModal';
import { TableInfoModal } from '../components/game/TableInfoModal';
import { ActionBubble } from '../components/game/ActionBubble';
import { EmojiBubble } from '../components/game/EmojiBubble';
import { EmojiPalette } from '../components/game/EmojiPalette';
import { MobileTableMenu } from '../components/game/MobileTableMenu';
import { TablePills } from '../components/game/TablePills';
import { DealAnimation } from '../components/game/DealAnimation';
import { ChipFlyAnimation } from '../components/game/ChipFlyAnimation';
import { useChipFlyAnimation } from '../hooks/useChipFlyAnimation';
import { buildDealCards } from '../components/game/dealLayout';
import { HandHistoryModal } from '../components/game/HandHistoryModal';
import { PlayerInfoPopup } from '../components/game/PlayerInfoPopup';
import { MobilePlayerSeat } from '../components/game/MobilePlayerSeat';
import { DEFAULT_DESIGN } from '../config/design';
import { loadBetPresets, saveBetPresets } from '../config/betPresets';
import type { BetPresets } from '../config/betPresets';
import { loadChipDisplay, saveChipDisplay, formatChips, formatMoney } from '../config/chipFormat';
import type { ChipDisplay } from '../config/chipFormat';
import { loadCardDeck, saveCardDeck } from '../config/cardDeck';
import type { CardDeck } from '../config/cardDeck';
import { loadGameSettings, saveGameSettings } from '../config/gameSettings';
import type { GameSettings } from '../config/gameSettings';
import { playSound } from '../lib/sound';
import { triggerHaptic } from '../lib/haptic';
import type { CardData } from '../components/game/Card';
import type { DesignConfig } from '../config/design';
import { useGameRoom } from '../hooks/useGameRoom';
import { useOpponentNotesStore } from '../store/opponentNotesStore';
import { useTableSwipe } from '../hooks/useTableSwipe';
import { useEphemeralBubbles } from '../hooks/useEphemeralBubbles';
import { useTableClock } from '../hooks/useTableClock';
import { useTableGeometry } from '../hooks/useTableGeometry';
import { computeBlindSeats } from '../utils/blinds';

// Админ-кнопки за столом — lazy-чанк, грузится только для админа (код не в бандле игрока).
const AdminTableControls = lazy(() => import('../components/admin/AdminTableControls'));

// GameState/GamePhase — из общего контракта shared (см. импорт выше).

// Фетр стола — фиксированный (тёмно-зелёный GG). Настройки темы/сукна из админки убраны.
const TABLE_FELT_CLASS = 'bg-[radial-gradient(ellipse_at_center,_#0e5e2e_0%,_#0a3d1d_70%,_#06281a_100%)]';

const PHASE_LABEL_KEY: Record<GamePhase, string> = {
  waiting: 'game.phaseWaiting',
  preflop: 'game.phasePreflop',
  flop: 'game.phaseFlop',
  turn: 'game.phaseTurn',
  river: 'game.phaseRiver',
  showdown: 'game.phaseShowdown',
};

export const GameRoom = () => {
  const { t } = useTranslation();
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  // Режим наблюдателя (?observe=1): входим зрителем, без посадки за стол.
  const observe = searchParams.get('observe') === '1';
  const navigate = useNavigate();
  // Свайп между открытыми столами (мультитейблинг) — альтернатива клику по пилюле.
  const swipe = useTableSwipe(roomId);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const userChips = useAuthStore((s) => s.user?.chips);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const token = useAuthStore((s) => s.token);
  const opponentNotes = useOpponentNotesStore((s) => s.notes);
  const fetchOpponentNotes = useOpponentNotesStore((s) => s.fetchNotes);
  const setOpponentNote = useOpponentNotesStore((s) => s.setNote);

  // Транспорт + ядро состояния стола (подписки, реджойн, эмиттеры)
  const { state, isConnected, winners, winningCards, winHandName, winAmounts, countdownEndsAt, sendAction, leave, sendEmoji, setAutoTopUp, setHandHint, showCard, requestRabbitHunt } =
    useGameRoom(roomId, observe);
  // Admin-peek toggle: при on сервер шлёт нам карты всех игроков + futureBoard.
  // По умолчанию off — админ играет «честно», peek включается осознанно.
  const [peekOn, setPeekOn] = useState(false);

  const [design, setDesign] = useState<DesignConfig>(DEFAULT_DESIGN);
  const [betPresets, setBetPresets] = useState<BetPresets>(() => loadBetPresets());
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [chipDisplay, setChipDisplay] = useState<ChipDisplay>(() => loadChipDisplay());
  const [cardDeck, setCardDeck] = useState<CardDeck>(() => loadCardDeck());
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => loadGameSettings());
  // Эфемерные пузыри действий/эмодзи над игроками (после gameSettings — нужен soundEnabled)
  const { actionBubbles, emojiBubbles, clearPlayerBubbles } = useEphemeralBubbles(gameSettings.soundEnabled);
  const [emojiPaletteOpen, setEmojiPaletteOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  // Раскрыт ли блок рейза в ActionPanel — чтобы прятать кнопку меню стола под ним (mobile).
  const [raiseOpen, setRaiseOpen] = useState(false);
  // Предвыбор действия (галочки «когда дойдёт ход, сразу X»).
  const [preselect, setPreselect] = useState<PreSelectAction | null>(null);
  // Тап по аватару оппонента — поп-ап с HUD-статистикой.
  const [avatarPopupPlayer, setAvatarPopupPlayer] = useState<import('../components/game/PlayerSeat').PlayerView | null>(null);

  // Админ-наблюдатель: сервер уже включил peek (шлёт карты соперников). Отражаем это в UI
  // сразу — рендер открытых карт завязан на локальный peekOn. Кнопка-глаз остаётся выключателем.
  useEffect(() => {
    if (observe && isAdmin) setPeekOn(true);
  }, [observe, isAdmin]);

  useEffect(() => {
    if (token) fetchOpponentNotes(token);
  }, [token, fetchOpponentNotes]);

  useEffect(() => {
    fetch(API_URL + '/design')
      .then((r) => r.json())
      .then((d) => setDesign({ ...DEFAULT_DESIGN, ...d }))
      .catch(() => {});
  }, []);

  // Производные секунды/проценты таймеров (единый тикер now)
  const { turnSecondsLeft, timebankSecondsLeft, turnPercent, timebankPercent } =
    useTableClock(state, countdownEndsAt);

  const myId = userId;
  const me = useMemo(() => state?.players.find((p) => p.id === myId) ?? null, [state, myId]);
  // Наблюдатель: состояние есть, но меня нет среди игроков (не сижу за столом).
  const isObserver = !!state && !me;
  // Можно ли мне добровольно показать карты (тап после раздачи): окно showdown, есть карты, и
  // они ещё НЕ раскрыты автоматически — т.е. я сфолдил ИЛИ выиграл без вскрытия (нет имени комбинации).
  const canShowCards =
    !!me &&
    state?.phase === 'showdown' &&
    me.cards.length === 2 &&
    (me.isFolded || (!!winners && !!myId && winners.includes(myId) && !winHandName));
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

  // Анимация фишек pot → победитель (desktop и mobile, отдельные координатные пространства)
  const { flyChips: desktopFlyChips, clearFlyChips: clearDesktopFly } = useChipFlyAnimation(winners, seatPositions);
  const { flyChips: mobileFlyChips, clearFlyChips: clearMobileFly } = useChipFlyAnimation(winners, mobileSeatPositions, 50, 48);

  const isMyTurn =
    !!state &&
    !!me &&
    currentPlayerId === me.id &&
    state.phase !== 'waiting' &&
    state.phase !== 'showdown';

  // Сигнал «твой ход»: звук + вибрация на фронте появления хода (по настройкам игры).
  // Также: авто-выполнение предвыбранного действия (preselect).
  const prevMyTurn = useRef(false);
  useEffect(() => {
    if (isMyTurn && !prevMyTurn.current) {
      if (gameSettings.soundEnabled) playSound('turn');
      if (gameSettings.vibrationEnabled) triggerHaptic('medium');
      if (preselect && me && state) {
        const callAmt = Math.max(0, state.currentBet - me.currentBet);
        const canChk = callAmt === 0;
        const act: 'fold' | 'check' | 'call' | null =
          preselect === 'fold' ? 'fold' :
          preselect === 'check-fold' ? (canChk ? 'check' : 'fold') :
          preselect === 'call-any' ? (canChk ? 'check' : 'call') : null;
        setPreselect(null);
        if (act) setTimeout(() => sendAction(act), 80);
      }
    }
    prevMyTurn.current = isMyTurn;
  }, [isMyTurn, gameSettings.soundEnabled, gameSettings.vibrationEnabled, preselect, me, state]);

  // Преференция авто-докупки → серверу: при посадке (me появился) и при смене настроек.
  // Сервер применит её между раздачами; единицы — в ББ (на сервере умножатся на bigBlind).
  const at = gameSettings.autoTopUp;
  useEffect(() => {
    if (!me?.id) return;
    setAutoTopUp({ enabled: at.enabled, thresholdBb: at.thresholdBB, targetBb: at.targetBB });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, at.enabled, at.thresholdBB, at.targetBB]);

  // Тумблер «Подсказка комбинации» → серверу (при посадке и смене настройки). Сервер начнёт/
  // перестанет считать equity и слать мою комбинацию + шанс на выигрыш.
  useEffect(() => {
    if (!me?.id) return;
    setHandHint(gameSettings.handHintEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, gameSettings.handHintEnabled]);

  // Вид стола зашит: десктоп — theme-classic + зелёный фетр; мобила — theme-clubgg (см. JSX ниже).
  const feltCls = TABLE_FELT_CLASS;
  const themeCls = 'theme-classic';
  const isWinningCard = (c: CardData) =>
    winningCards.some((w) => w.suit === c.suit && w.rank === c.rank);
  const showHighlight = state?.phase === 'showdown' && winningCards.length > 0;
  const timebankEnabled = !!state?.timebankEnabled;
  // Умный фокус: во время хода подсвечиваем активного игрока и приглушаем остальных оппонентов.
  const smartFocus =
    gameSettings.smartFocusEnabled &&
    state?.phase !== 'waiting' &&
    state?.phase !== 'showdown' &&
    currentPlayerId != null;

  // Анимация раздачи (§10.1): запускается при входе в новую раздачу (любая фаза → preflop).
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const [dealId, setDealId] = useState(0);
  const [dealing, setDealing] = useState(false);
  useEffect(() => {
    const cur = state?.phase ?? null;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = cur;
    if (cur === 'preflop' && prev && prev !== 'preflop') {
      setDealId((k) => k + 1);
      setDealing(true);
      if (gameSettings.soundEnabled) playSound('deal');
    } else if (cur === 'flop' || cur === 'turn' || cur === 'river') {
      if (prev && prev !== cur && gameSettings.soundEnabled) playSound('deal');
    }
  }, [state?.phase, gameSettings.soundEnabled]);

  // Перед показом WIN-бейджа убираем пузыри (fold/call/raise) у победителей.
  useEffect(() => {
    if (winners && winners.length > 0) clearPlayerBubbles(winners);
  }, [winners]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Ждём второго игрока» показываем только если в waiting-фазе пробыли >400ms —
  // иначе мелькает при быстрой смене waiting→preflop между раздачами.
  const [stableWaiting, setStableWaiting] = useState(false);
  useEffect(() => {
    if (state?.phase !== 'waiting' || countdownEndsAt !== null) {
      setStableWaiting(false);
      return;
    }
    const t = setTimeout(() => setStableWaiting(true), 400);
    return () => clearTimeout(t);
  }, [state?.phase, countdownEndsAt]);

  if (!state) {
    return (
      <div className="h-[100dvh] md:h-[calc(100dvh-4rem)] flex items-center justify-center text-gray-400">
        {t('game.connecting')}
      </div>
    );
  }

  return (
    <div
      className={'gameroom-root-mobile-clubgg relative w-full h-[100dvh] md:h-[calc(100dvh-4rem)] overflow-hidden ' + feltCls + ' ' + themeCls}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      {/* Баннер переподключения — показывается при потере сокет-соединения */}
      <AnimatePresence>
        {!isConnected && (
          <motion.div
            key="reconnect-banner"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="absolute top-0 inset-x-0 z-50 flex items-center justify-center gap-2 py-1.5 bg-orange-900/90 backdrop-blur text-orange-200 text-xs font-semibold pointer-events-none"
          >
            <span className="animate-pulse">●</span> {t('game.reconnecting')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Мультитейблинг: пилюли открытых столов (мои карты + подсветка хода) + «+». Видно на всех таргетах. */}
      <div className="absolute top-3 left-3 z-30">
        <TablePills />
      </div>

      {/* Баннер наблюдателя: вход зрителем (мест нет / просто смотрю). Карты соперников
          скрыты; админу — видны (сервер шлёт peek). Кнопка выхода — в баре/нижнем меню. */}
      {isObserver && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white/90 text-xs font-bold pointer-events-none whitespace-nowrap">
          <Eye size={13} className="text-emerald-300" />
          {t('game.observing')}{isAdmin ? t('game.observingCardsVisible') : ''}
        </div>
      )}

      {/* История раздач — иконка top-right (на mobile; на desktop она в верхнем баре). */}
      <button
        onClick={() => setHistoryModalOpen(true)}
        title={t('game.handHistory')}
        className="md:hidden absolute top-3 right-3 z-30 flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 text-white/80 border border-white/10"
      >
        <History size={18} />
      </button>

      {/* Верхний бар — только desktop. На mobile/TWA кнопки уехали в нижнее меню (MobileTableMenu). */}
      <div className="absolute top-4 left-4 right-4 hidden md:flex justify-between items-center z-20">
        <div className="flex items-center gap-2 max-w-[60vw] md:max-w-none">
          {/* Phase и roomName перенесены в центр стола (для desktop+mobile).
              На mobile Layout-navbar скрыта, поэтому balance + Admin-кнопка показаны здесь (md:hidden).
              На desktop balance/admin остаются в Layout navbar. */}
          {typeof userChips === 'number' && (
            <span
              title={t('game.freeBankroll')}
              className="md:hidden inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold whitespace-nowrap backdrop-blur"
            >
              <Coins size={12} /> {formatMoney(userChips)}
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
            onClick={() => setHistoryModalOpen(true)}
            title={t('game.handHistory')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setInfoModalOpen(true)}
            title={t('game.tableInfo')}
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
            title={t('game.reactions')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <Smile size={16} />
          </button>
          <button
            onClick={() => setSettingsModalOpen(true)}
            title={t('game.gameSettings')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={leave}
            title={state.tournamentId ? 'Покинуть турнир — фишки не возвращаются' : t('game.leaveTable')}
            className="flex items-center gap-1 md:px-3 md:py-1.5 justify-center w-9 h-9 md:w-auto md:h-auto rounded-xl bg-red-600/80 hover:bg-red-700 text-white text-sm font-bold"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">{t('game.leave')}</span>
          </button>
        </div>
      </div>

      <EmojiPalette
        open={emojiPaletteOpen}
        onClose={() => setEmojiPaletteOpen(false)}
        onPick={sendEmoji}
      />

      {/* Mobile/TWA: нижнее выезжающее меню стола (свайп снизу-вверх / ручка). */}
      <MobileTableMenu
        userChips={userChips}
        isAdmin={isAdmin}
        roomId={roomId}
        peekOn={peekOn}
        setPeekOn={setPeekOn}
        onOpenAdmin={() => navigate('/admin')}
        onOpenInfo={() => setInfoModalOpen(true)}
        onToggleEmoji={() => setEmojiPaletteOpen((v) => !v)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onLeave={leave}
        hideTrigger={raiseOpen}
      />

      {/* Desktop: овальный стол. Обёртка ограничена снизу (bottom-56), чтобы seat-позиции
          в % считались относительно зоны над ActionPanel'ом — иначе «я»-seat на top=84%
          уезжает внутрь ActionPanel'а (~210px высотой) на FullHD-мониторах. */}
      <div className="hidden md:block absolute top-0 left-0 right-0 bottom-56">
        {/* Theme spotlight — тёплый/cyan/Tiffany световой конус на felt центре (per theme) */}
        <div className="poker-spotlight absolute inset-0 pointer-events-none z-0" />
        {/* Decorative oval rail — themed: gold/chrome/wood с nailheads */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="poker-oval-rail w-[90%] max-w-4xl aspect-[200/115]" />
        </div>
        {/* Watermark — бренд-монограмма, не название стола */}
        <div className="poker-watermark poker-watermark--room absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
          POKER HUB
        </div>

        <div className="absolute top-[65%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          {/* Фаза игры — переехала сюда из верхнего бара */}
          <div className="text-poker-gold text-xs font-bold uppercase tracking-widest">
            {t(PHASE_LABEL_KEY[state.phase])}
          </div>
          {/* Метаданные стола — серым над банком */}
          <div className="text-white/40 text-xs font-semibold tracking-wide max-w-[280px] truncate -mt-1">
            {state.roomName}
          </div>
          <div className="text-white/30 text-[11px] font-bold uppercase tracking-widest -mt-1">
            {state.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}: {formatMoney(state.smallBlind)}/{formatMoney(state.bigBlind)}
          </div>
          {state.tournamentId && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-widest -mt-0.5">
              <Trophy size={9} />
              Турнирный стол
            </div>
          )}
          {state.badBeatEligible && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-widest -mt-0.5">
              <Zap size={9} className="fill-yellow-400" />
              Bad Beat Jackpot
            </div>
          )}
          <motion.div
            key={state.pot}
            initial={{ scale: 0.85 }}
            animate={{ scale: 1, opacity: state.phase === 'showdown' ? 0 : 1 }}
            transition={{ opacity: { duration: 0.6 } }}
            className="text-2xl font-black text-white bg-black/50 px-4 py-1 rounded-full backdrop-blur ring-1 ring-white/10"
          >
            {t('game.pot')}: {formatChips(state.pot, state.bigBlind, chipDisplay)}
          </motion.div>
          <div className="flex gap-1.5 mt-2">
            {state.communityCards.map((c, i) => (
              <Card
                key={i}
                card={c}
                faceStyle="classic"
                backStyle={design.cardBackStyle}
                deck={cardDeck}
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
                    faceStyle="classic"
                    backStyle={design.cardBackStyle}
                    deck={cardDeck}
                    size="md"
                    delay={0}
                  />
                </div>
              ))}
            {state.communityCards.length === 0 && state.phase !== 'waiting' && !peekOn && (
              <div className="text-white/30 text-sm italic">{t('game.cardsNotRevealed')}</div>
            )}
          </div>
          {peekOn && (
            <div className="text-red-400/80 text-[10px] font-bold uppercase tracking-widest mt-1">
              🔮 admin-peek
            </div>
          )}
          {state.observers && state.observers.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-white/30 text-[9px] uppercase tracking-widest">👁</span>
              {state.observers.slice(0, 5).map(o => (
                <div key={o.id} title={o.username} className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center text-[7px] font-bold text-white/60 uppercase">
                  {o.username[0]}
                </div>
              ))}
              {state.observers.length > 5 && (
                <span className="text-white/30 text-[8px]">+{state.observers.length - 5}</span>
              )}
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
          // Дилер — белая «шайба» (как настоящий дилерский баттон), крупнее. SB/BB — компактные жетоны.
          const badgeCls = isDealer
            ? 'min-w-[26px] h-[26px] text-[12px] bg-white text-gray-900 ring-2 ring-gray-300/80'
            : isSB
            ? 'min-w-[22px] h-[22px] text-[10px] bg-sky-500 text-white ring-1 ring-sky-900/40'
            : 'min-w-[22px] h-[22px] text-[10px] bg-purple-500 text-white ring-1 ring-purple-900/40';
          return (
            <div
              key={'role-' + player.id}
              className={
                'absolute z-20 px-1 rounded-full font-black flex items-center justify-center shadow-md pointer-events-none ' +
                badgeCls
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
          const focusTarget = player.id === currentPlayerId;
          return (
            <div
              key={player.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: left + '%', top: top + '%' }}
            >
              <div
                className="relative transition-[transform,opacity] duration-300"
                style={{
                  transform: smartFocus && focusTarget ? 'scale(1.08)' : 'scale(1)',
                  opacity: smartFocus && !focusTarget && player.id !== myId ? 0.5 : 1,
                  zIndex: smartFocus && focusTarget ? 1 : undefined,
                }}
              >
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
                  showHint={gameSettings.handHintEnabled}
                  faceStyle="classic"
                  backStyle={design.cardBackStyle}
                  deck={cardDeck}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                  winningCards={showHighlight ? winningCards : undefined}
                  winAmount={winners?.includes(player.id) ? winAmounts[player.id] : undefined}
                  handName={winners?.includes(player.id) ? winHandName : undefined}
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
                  onAvatarClick={player.id !== myId ? setAvatarPopupPlayer : undefined}
                />
              </div>
            </div>
          );
        })}

        {/* Анимация раздачи — карты от дилера к местам (desktop-слой) */}
        {dealing && (
          <DealAnimation
            key={'deal-d-' + dealId}
            cards={buildDealCards(seatPositions, dealerPlayerId)}
            backStyle={design.cardBackStyle}
            onDone={() => setDealing(false)}
          />
        )}
        {/* Анимация фишек: pot → победитель (desktop) */}
        <ChipFlyAnimation chips={desktopFlyChips} onDone={clearDesktopFly} />
      </div>

      {/* MOBILE: овальный стол с seats по периметру (плана §1-§4 + design-review priorities).
          theme-clubgg на mobile-блоке принудительно (вид стола зашит; тема/сукно из админки убраны).
          Геометрия под эталон ClubGG (бок 7% / верх 18% / низ 12%) — те же пропорции, под которые
          подобран border-radius стадиона 50%/29% в .theme-clubgg .poker-oval-rail (index.css). */}
      <div className="md:hidden theme-clubgg mobile-table-felt absolute inset-x-[4%] top-[6%] bottom-[2%] pointer-events-none" style={{ perspective: '750px' }}>
        {/* Фетр/рейл — наклонённый фоновый слой (perspective+rotateX), как у ClubGG: верх уже / низ шире.
            Контент (банк, борд, плашки) сюда НЕ кладём — иначе перекосит; он плоским слоем ниже. */}
        <div className="poker-oval-rail pointer-events-none" style={{ position: 'absolute', inset: 0, transform: 'translateY(-4%) rotateX(24deg) scaleY(1.15)' }}>
          {/* spotlight на поверхности стола — наклоняется вместе с фетром */}
          <div className="poker-spotlight absolute inset-0 pointer-events-none rounded-[50%]" />
        </div>

        {/* Контент — плоский слой поверх наклонённого стола */}
        <div className="absolute inset-0 pointer-events-none">

          {/* Layer 1: центр — watermark + NLH-pill + roomName сверху, pot-plate ПОД данными стола
              (иерархия "данные → банк → борд"), community-cards внизу. */}
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-[54%] gap-2 pointer-events-none z-10 px-4">
            <div className="poker-watermark poker-watermark--center select-none mt-2">POKER HUB</div>
            <div className="text-emerald-300 text-[13px] font-bold uppercase tracking-widest [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
              {state.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'} {formatMoney(state.smallBlind)}/{formatMoney(state.bigBlind)}
            </div>
            {state.tournamentId && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold uppercase tracking-widest">
                <Trophy size={8} />
                Турнирный стол
              </div>
            )}
            {state.badBeatEligible && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[9px] font-bold uppercase tracking-widest">
                <Zap size={8} className="fill-yellow-400" />
                Bad Beat Jackpot
              </div>
            )}
            {state.pot > 0 && state.phase !== 'showdown' && (
              <div className="pot-plate-mobile">
                <div className="pot-label">{t('game.potMobile')}</div>
                <div className="pot-value">{formatChips(state.pot, state.bigBlind, chipDisplay)}</div>
              </div>
            )}
            {state.communityCards.length > 0 || (peekOn && state.futureBoard && state.futureBoard.length > 0) ? (
              <div className="flex gap-1 flex-wrap justify-center max-w-full mt-1">
                {state.communityCards.map((c, i) => (
                  <Card
                    key={i}
                    card={c}
                    faceStyle="classic"
                    backStyle={design.cardBackStyle}
                    deck={cardDeck}
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
                        faceStyle="classic"
                        backStyle={design.cardBackStyle}
                        deck={cardDeck}
                        size="sm"
                        delay={0}
                      />
                    </div>
                  ))}
              </div>
            ) : state.phase !== 'waiting' ? (
              <div className="text-white/30 text-[10px] italic mt-1">{t('game.cardsNotRevealed')}</div>
            ) : null}
            {state.observers && state.observers.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-white/30 text-[8px]">👁</span>
                {state.observers.slice(0, 4).map(o => (
                  <div key={o.id} title={o.username} className="w-3.5 h-3.5 rounded-full bg-white/15 flex items-center justify-center text-[6px] font-bold text-white/60 uppercase">
                    {o.username[0]}
                  </div>
                ))}
                {state.observers.length > 4 && (
                  <span className="text-white/30 text-[8px]">+{state.observers.length - 4}</span>
                )}
              </div>
            )}
          </div>

          {/* Layer 2: seats по периметру овала (mobileSeatPositions, me на индексе 0 = bottom-center) */}
          {mobileSeatPositions.map(({ player, left, top }) => {
            const isCurr = player.id === currentPlayerId && state.phase !== 'waiting' && state.phase !== 'showdown';
            return (
              <div
                key={player.id}
                className="absolute z-20 pointer-events-auto transition-[transform,opacity] duration-300"
                style={{
                  left: left + '%',
                  top: top + '%',
                  transform:
                    'translate(-50%, -50%)' + (smartFocus && isCurr ? ' scale(1.1)' : ' scale(1)'),
                  opacity: smartFocus && !isCurr && player.id !== myId ? 0.5 : 1,
                  zIndex: smartFocus && isCurr ? 30 : 20,
                }}
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
                  faceStyle="classic"
                  backStyle={design.cardBackStyle}
                  deck={cardDeck}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                  turnSecondsLeft={isCurr ? turnSecondsLeft : null}
                  turnPercent={isCurr ? turnPercent : null}
                  timebankSecondsLeft={isCurr ? timebankSecondsLeft : null}
                  timebankPercent={isCurr ? timebankPercent : null}
                  actionBubble={actionBubbles[player.id]}
                  emojiBubble={emojiBubbles[player.id]}
                  winningCards={winningCards}
                  winAmount={winners?.includes(player.id) ? winAmounts[player.id] : undefined}
                  handName={winners?.includes(player.id) ? winHandName : undefined}
                  isAdminPeek={peekOn && state.phase !== 'showdown'}
                  showHint={gameSettings.handHintEnabled}
                  onAvatarClick={player.id !== myId ? setAvatarPopupPlayer : undefined}
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
                />
              </div>
            ) : null,
          )}

          {/* Layer 4: D/SB/BB-бейдж прижат к плашке со стороны центра стола (10% пути от seat) */}
          {/* Мой бейдж — не здесь, а в fixed-блоке моих карт (см. ниже). */}
          {state.phase !== 'waiting' && mobileSeatPositions.map(({ player, dealerLeft, dealerTop }) => {
            const isDealer = player.id === dealerPlayerId;
            const isSB = player.id === sbPlayerId && player.id !== dealerPlayerId;
            const isBB = player.id === bbPlayerId;
            const role = isDealer ? 'D' : isSB ? 'SB' : isBB ? 'BB' : null;
            if (!role || player.id === myId) return null;
            // Дилер — белая «шайба» (крупнее, заметна на фетре). SB/BB — компактные цветные жетоны.
            const cls = isDealer
              ? 'min-w-[22px] h-[22px] text-[11px] bg-white text-gray-900 ring-2 ring-gray-300/80'
              : isSB
              ? 'min-w-[19px] h-[19px] text-[9px] bg-sky-500 text-white ring-1 ring-black/30'
              : 'min-w-[19px] h-[19px] text-[9px] bg-purple-500 text-white ring-1 ring-black/30';
            return (
              <div
                key={'role-' + player.id}
                className={
                  'absolute -translate-x-1/2 -translate-y-1/2 z-20 px-1 rounded-full font-black flex items-center justify-center shadow-lg pointer-events-none ' +
                  cls
                }
                style={{ left: dealerLeft + '%', top: dealerTop + '%' }}
              >
                {role}
              </div>
            );
          })}

          {/* Анимация раздачи — карты от дилера к местам (mobile-слой) */}
          {dealing && (
            <DealAnimation
              key={'deal-m-' + dealId}
              cards={buildDealCards(mobileSeatPositions, dealerPlayerId)}
              backStyle={design.cardBackStyle}
              onDone={() => setDealing(false)}
            />
          )}
          {/* Анимация фишек: pot → победитель (mobile) */}
          <ChipFlyAnimation chips={mobileFlyChips} onDone={clearMobileFly} />
        </div>
      </div>


      <AnimatePresence>
        {stableWaiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-xl text-gray-300 text-sm"
          >
            {t('game.waitingForSecondPlayer')}
          </motion.div>
        )}

      </AnimatePresence>

      {/* MOBILE: мои карты — fixed-блок, привязан к верхнему краю бокса ActionPanel.
          Закрытый ActionPanel ~104px от низа viewport (button 56 + p-3 padding + safe-area).
          Кладём cards bottom-[108px] чтобы низ карт сидел чуть выше top-edge action-box.
          На showdown — не рендерим (showdown-карты уже в MobilePlayerSeat overlay'е). */}
      {me && state.phase !== 'showdown' && (
        <div className="md:hidden fixed bottom-[82px] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none scale-[0.69] origin-bottom">
          {/* Мой стек — над картами (перенесён сюда из плашки seat'а) */}
          <span className="mb-1.5 px-3 py-0.5 rounded-full bg-black/70 backdrop-blur border border-white/15 text-amber-300 text-xl font-black tabular-nums whitespace-nowrap">
            {formatChips(me.chips, state.bigBlind, chipDisplay)}
          </span>
          {me.cards.length > 0 && (
            <div className="relative flex gap-1.5">
              {me.cards.map((c, i) => (
                <Card
                  key={i}
                  card={c}
                  faceStyle="classic"
                  backStyle={design.cardBackStyle}
                  deck={cardDeck}
                  size="lg"
                  delay={i * 0.05}
                />
              ))}
              {/* Таймер своего хода — рамка вокруг моих карт (аватарки нет; см. CardsTurnTimer). */}
              {isMyTurn && timebankSecondsLeft != null && timebankPercent != null ? (
                <CardsTurnTimer percent={timebankPercent} secondsLeft={timebankSecondsLeft} variant="timebank" />
              ) : isMyTurn && turnSecondsLeft != null && turnPercent != null ? (
                <CardsTurnTimer
                  percent={turnPercent}
                  secondsLeft={turnSecondsLeft}
                  variant={turnSecondsLeft <= 5 ? 'turn-urgent' : 'turn'}
                />
              ) : null}
              {/* D/SB/BB — в правом верхнем углу моих карт */}
              {(() => {
                const role =
                  myId === dealerPlayerId ? 'D'
                  : myId === sbPlayerId && myId !== dealerPlayerId ? 'SB'
                  : myId === bbPlayerId ? 'BB'
                  : null;
                if (!role) return null;
                const cls =
                  role === 'D'
                    ? 'bg-white text-gray-900 ring-2 ring-gray-300/80 min-w-[33px] h-[33px] text-[17px]'
                    : role === 'SB'
                    ? 'bg-sky-500 text-white ring-1 ring-black/30 min-w-[29px] h-[29px] text-[14px]'
                    : 'bg-purple-500 text-white ring-1 ring-black/30 min-w-[29px] h-[29px] text-[14px]';
                return (
                  <div
                    className={'absolute -top-3 -right-3 z-10 px-1 rounded-full font-black flex items-center justify-center shadow-lg pointer-events-none ' + cls}
                  >
                    {role}
                  </div>
                );
              })()}
            </div>
          )}
          {/* Подсказка под моими картами: текущая комбинация + шанс на выигрыш (по тумблеру). */}
          {gameSettings.handHintEnabled && me.handHint && (
            <span className="mt-1.5 px-3 py-0.5 rounded-full bg-black/75 backdrop-blur border border-emerald-400/30 text-emerald-300 text-[15px] font-bold whitespace-nowrap">
              {me.handHint}
              {typeof me.winChance === 'number' ? ' · ' + me.winChance + '%' : ''}
            </span>
          )}
        </div>
      )}

      {/* Добровольный показ своих карт после раздачи: тап по карте → видна всем. Появляется
          только если карты ещё не раскрыты (сфолдил / выиграл без вскрытия). 5-сек окно showdown. */}
      {canShowCards && me && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-auto">
          <span className="text-white/75 text-[11px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {t('game.showCardToOpponent')}
          </span>
          <div className="flex gap-2">
            {me.cards.map((c, i) => {
              const shown = !!me.revealedCards?.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={shown}
                  onClick={() => showCard(i)}
                  className={
                    'relative rounded-lg transition-transform ' +
                    (shown ? 'ring-2 ring-emerald-400' : 'hover:-translate-y-1 active:translate-y-0')
                  }
                >
                  <Card card={c} faceStyle="classic" backStyle={design.cardBackStyle} deck={cardDeck} size="md" />
                  {shown ? (
                    <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                      ✓
                    </span>
                  ) : (
                    <span className="absolute inset-x-0 -bottom-4 text-center text-emerald-300 text-[9px] font-bold">
                      {t('game.show')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rabbit Hunting (платная фича §10.12): рука кончилась раньше ривера — за плату узнать,
          какие карты пришли бы. Доступно любому за столом (вкл. сфолдивших), пока окно showdown открыто. */}
      {me && state?.rabbitHunt && (
        <div className="fixed bottom-48 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-auto">
          {state.rabbitHunt.revealed ? (
            <>
              <span className="text-white/75 text-[11px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                {t('game.rabbitHuntRevealed')}
              </span>
              <div className="flex gap-2">
                {state.rabbitHunt.revealed.map((c, i) => (
                  <Card key={i} card={c} faceStyle="classic" backStyle={design.cardBackStyle} deck={cardDeck} size="md" />
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={requestRabbitHunt}
              className="px-4 py-2 rounded-xl bg-black/70 backdrop-blur border border-amber-400/40 text-amber-300 text-[12px] font-bold shadow-lg hover:bg-black/85 transition-colors"
            >
              {t('game.rabbitHuntButton', { price: formatChips(state.rabbitHunt.price, state.bigBlind, chipDisplay) })}
            </button>
          )}
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
          onRaiseOpenChange={setRaiseOpen}
        />
      )}

      {me && !isMyTurn && state && state.phase !== 'waiting' && state.phase !== 'showdown' && (
        <PreSelectPanel value={preselect} onChange={setPreselect} />
      )}

      <HandHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        myId={myId}
        chipDisplay={chipDisplay}
        cardDeck={cardDeck}
        cardBackStyle={design.cardBackStyle}
      />

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

      <GameSettingsModal
        open={settingsModalOpen}
        initialPresets={betPresets}
        initialChipDisplay={chipDisplay}
        initialDeck={cardDeck}
        initialSettings={gameSettings}
        onClose={() => setSettingsModalOpen(false)}
        onSave={({ presets, chipDisplay: nextDisplay, deck: nextDeck, settings: nextSettings }) => {
          setBetPresets(presets);
          saveBetPresets(presets);
          setChipDisplay(nextDisplay);
          saveChipDisplay(nextDisplay);
          setCardDeck(nextDeck);
          saveCardDeck(nextDeck);
          setGameSettings(nextSettings);
          saveGameSettings(nextSettings);
        }}
      />

      <PlayerInfoPopup
        player={avatarPopupPlayer}
        note={avatarPopupPlayer ? opponentNotes[avatarPopupPlayer.id] ?? '' : ''}
        onNoteChange={(text) => {
          if (avatarPopupPlayer && token) setOpponentNote(token, avatarPopupPlayer.id, text);
        }}
        onClose={() => setAvatarPopupPlayer(null)}
      />
    </div>
  );
};

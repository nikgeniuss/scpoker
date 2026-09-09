import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings, Smile, Info, Coins, History, Eye, Zap, Trophy, Check, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAkTableStore } from '../store/akTableStore';
import { useInventoryStore } from '../store/inventoryStore';
import { tableGlowColor } from '../config/cosmetics';
import { API_URL } from '../config/api';
import type { GamePhase } from '@poker-room/shared';
import { isBotId } from '@poker-room/shared';
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
import { AkTableTopBar } from '../components/game/AkTableTopBar';
import { TablePills } from '../components/game/TablePills';
import { DealAnimation } from '../components/game/DealAnimation';
import { ChipFlyAnimation } from '../components/game/ChipFlyAnimation';
import { useChipFlyAnimation } from '../hooks/useChipFlyAnimation';
import { buildDealCards } from '../components/game/dealLayout';
import { HandHistoryModal } from '../components/game/HandHistoryModal';
import { PlayerInfoPopup } from '../components/game/PlayerInfoPopup';
import { MobilePlayerSeat } from '../components/game/MobilePlayerSeat';
import { HandStrengthMeter } from '../components/game/HandStrengthMeter';
import { SEGMENTS } from '../components/game/handStrengthColors';
import { avatarColor } from '../components/game/seatColors';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../utils/avatar';
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
import { useBlindLevelCountdown } from '../hooks/useBlindLevelCountdown';
import { useTableGeometry } from '../hooks/useTableGeometry';
import { useBetSweepAnimation } from '../hooks/useBetSweepAnimation';
import { computeBlindSeats } from '../utils/blinds';
import { loadAdminPeek, saveAdminPeek } from '../config/adminPeek';

// Админ-кнопки за столом — lazy-чанк, грузится только для админа (код не в бандле игрока).
const AdminTableControls = lazy(() => import('../components/admin/AdminTableControls'));

// GameState/GamePhase — из общего контракта shared (см. импорт выше).

// Фетр стола — фиксированный (тёмно-зелёный GG). Настройки темы/сукна из админки убраны.
const TABLE_FELT_CLASS = 'bg-[radial-gradient(ellipse_at_center,_#0e5e2e_0%,_#0a3d1d_70%,_#06281a_100%)]';

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
  // Косметика (ROADMAP §10.21.11-12): эксклюзивные эмодзи для EmojiPalette + личная подсветка
  // стола (видна ТОЛЬКО этому клиенту — не транспортируется через GameState).
  const cosmeticsCatalog = useInventoryStore((s) => s.catalog);
  const cosmeticsOwned = useInventoryStore((s) => s.owned);
  const cosmeticsEquipped = useInventoryStore((s) => s.equipped);
  const loadCosmeticsMine = useInventoryStore((s) => s.loadMine);
  useEffect(() => {
    loadCosmeticsMine(token);
  }, [loadCosmeticsMine, token]);
  const extraEmoji = cosmeticsCatalog
    .filter((i) => i.type === 'emoji' && cosmeticsOwned.includes(i.id))
    .map((i) => i.value);
  const equippedGlowItem = cosmeticsEquipped.tableGlow
    ? cosmeticsCatalog.find((i) => i.id === cosmeticsEquipped.tableGlow)
    : undefined;
  const tableGlow = tableGlowColor(equippedGlowItem?.value);
  // AK-стол — отдельный admin-тоггл (SettingsTab), скин только для mobile-блока ниже.
  const akTableEnabled = useAkTableStore((s) => s.enabled);
  const opponentNotes = useOpponentNotesStore((s) => s.notes);
  const fetchOpponentNotes = useOpponentNotesStore((s) => s.fetchNotes);
  const setOpponentNote = useOpponentNotesStore((s) => s.setNote);

  // Транспорт + ядро состояния стола (подписки, реджойн, эмиттеры)
  const { state, isConnected, winners, winningCards, winHandName, winAmounts, countdownEndsAt, sendAction, leave, sendEmoji, setAutoTopUp, setHandHint, showCard, requestRabbitHunt } =
    useGameRoom(roomId, observe);
  // Admin-peek toggle: при on сервер шлёт нам карты всех игроков + futureBoard.
  // По умолчанию off — админ играет «честно», peek включается осознанно.
  // Восстанавливаем из localStorage — иначе сворачивание ТГ (пересоздание WebView, стейт
  // компонента теряется) заставляет админа включать заново. Сервер тоже помнит peek per-user
  // (не per-socket) — см. GameManager.setAdminPeek — так что после реконнекта карты придут сами.
  const [peekOn, setPeekOn] = useState(() => loadAdminPeek());
  useEffect(() => {
    saveAdminPeek(peekOn);
  }, [peekOn]);

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
  // Турнирный HUD под общими картами: через сколько вырастут блайнды и на сколько.
  const blindsRiseIn = useBlindLevelCountdown(state?.tournamentNextLevelAt);

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
  // Ставки → банк: снэпшот ставок последней улицы на короткое время после смены фазы (сервер уже
  // обнулил их) — по нему фишки визуально «уезжают» в центр стола и растворяются.
  const sweepingBets = useBetSweepAnimation(state);

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

  // Вид стола зашит: десктоп — theme-classic + зелёный фетр всегда (референс AK — только мобилка,
  // десктоп не трогаем). Мобила — theme-clubgg или theme-ak (см. JSX ниже) по akTableEnabled.
  const feltCls = TABLE_FELT_CLASS;
  const themeCls = 'theme-classic';
  const mobileThemeCls = akTableEnabled ? 'theme-ak' : 'theme-clubgg';
  const mobileRootCls = akTableEnabled ? 'gameroom-root-mobile-ak' : 'gameroom-root-mobile-clubgg';
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
      className={mobileRootCls + ' relative w-full h-[100dvh] md:h-[calc(100dvh-4rem)] overflow-hidden ' + feltCls + ' ' + themeCls}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      {/* Личная подсветка стола (косметика, ROADMAP §10.21.12) — аддитивный радиальный акцент,
          видна ТОЛЬКО этому игроку, поверх уже существующего фетра/AK-темы, не заменяет их. */}
      {tableGlow && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, transparent 40%, ${tableGlow} 100%)` }}
        />
      )}

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

      {/* История раздач — иконка top-right (на mobile; на desktop она в верхнем баре).
          На AK-скине не рендерим — там своя иконка истории в AkTableTopBar (fixed top-4 right-4),
          дублировались и накладывались друг на друга (один визуально перекрывал клики другого). */}
      {!akTableEnabled && (
        <button
          onClick={() => setHistoryModalOpen(true)}
          title={t('game.handHistory')}
          className="md:hidden absolute top-3 right-3 z-30 flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 text-white/80 border border-white/10"
        >
          <History size={18} />
        </button>
      )}

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
            title={state.tournamentId ? t('game.leaveTournamentTitle') : t('game.leaveTable')}
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
        extraEmoji={extraEmoji}
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
        akTrigger={akTableEnabled}
      />

      {/* AK-стол: верхняя панель иконок (инфо/история/настройки/трастовый бейдж) — референс AK Poker. */}
      {akTableEnabled && (
        <AkTableTopBar
          onOpenInfo={() => setInfoModalOpen(true)}
          onOpenHistory={() => setHistoryModalOpen(true)}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      )}

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
              {t('game.tournamentTable')}
            </div>
          )}
          {state.badBeatEligible && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-widest -mt-0.5">
              <Zap size={9} className="fill-yellow-400" />
              Bad Beat Jackpot
            </div>
          )}
          {/* Активные спец-режимы стола (ROADMAP §9.1): раньше о них можно было узнать только
              в модалке до посадки, хотя они меняют ход раздачи и деньги. Строка переносится —
              на узком экране несколько режимов не ломают вёрстку центра. */}
          {state.tableModes && state.tableModes.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 max-w-[240px] -mt-0.5">
              {state.tableModes.map((mode) => (
                <span
                  key={mode}
                  className="px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-bold uppercase tracking-widest"
                >
                  {t('game.mode.' + mode)}
                </span>
              ))}
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
          {state.pot > 0 && state.phase !== 'showdown' && (
            <ChipStack amount={state.pot} bigBlind={state.bigBlind} displayMode={chipDisplay} hideLabel />
          )}
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
          {state.tournamentId && blindsRiseIn && state.tournamentNextBigBlind !== undefined && (
            <div className="text-amber-400/80 text-[11px] font-bold mt-1">
              {t('game.blindsRiseIn', { time: blindsRiseIn, bb: formatMoney(state.tournamentNextBigBlind) })}
            </div>
          )}
          {/* Double Board / RIMT (доделка §10.6): второй борд, если стол его дилит. */}
          {state.communityCardsB && state.communityCardsB.length > 0 && (
            <div className="flex gap-1.5 mt-1.5">
              {state.communityCardsB.map((c, i) => (
                <Card key={'b-' + i} card={c} faceStyle="classic" backStyle={design.cardBackStyle} deck={cardDeck} size="md" delay={i * 0.1} />
              ))}
            </div>
          )}
          {state.settlementMode === 'rimt' && (
            <div className="text-emerald-400/90 text-[10px] font-bold uppercase tracking-widest mt-1">{t('game.settlementRimt')}</div>
          )}
          {state.settlementMode === 'evCashout' && (
            <div className="text-emerald-400/90 text-[10px] font-bold uppercase tracking-widest mt-1">{t('game.settlementEvCashout')}</div>
          )}
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

        {/* Фишки ставок — между seat и центром. По завершении улицы (и на showdown) анимированно
            стягиваются к банку в центре и растворяются (sweepingBets — снэпшот сервером уже
            обнулённых ставок, см. useBetSweepAnimation). Используем чистый CSS transition —
            Framer Motion плохо интерполирует left/top в `%`-строках. */}
        {seatPositions.map(({ player, chipLeft, chipTop }) => {
          const sweepAmount = sweepingBets[player.id];
          const amount = player.currentBet > 0 ? player.currentBet : sweepAmount;
          if (!amount) return null;
          const sweeping = player.currentBet <= 0 && !!sweepAmount;
          return (
            <div
              key={'chips-' + player.id}
              className="absolute z-10"
              style={{
                left: sweeping ? '50%' : chipLeft + '%',
                top: sweeping ? '50%' : chipTop + '%',
                opacity: sweeping ? 0 : 1,
                transform: 'translate(-50%, -50%)' + (sweeping ? ' scale(0.5)' : ' scale(1)'),
                transition: 'left 0.9s ease-in-out, top 0.9s ease-in-out, opacity 0.9s ease-in-out, transform 0.9s ease-in-out',
              }}
            >
              <ChipStack
                amount={amount}
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
                {/* Над аватаром — только эмодзи. Тег действия ушёл в плашку места, на строку
                    стека (решение пользователя 2026-09-08): так решение соперника видно там же,
                    куда игрок и так смотрит, а не в отрыве сверху. */}
                {eb && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none z-20">
                    <AnimatePresence mode="popLayout">
                      <EmojiBubble key={'e-' + eb.key} emoji={eb.emoji} />
                    </AnimatePresence>
                  </div>
                )}
                <PlayerSeat
                  actionBubble={player.id === myId ? undefined : ab}
                  player={player}
                  isSelf={player.id === myId}
                  onShowCard={canShowCards && player.id === myId ? showCard : undefined}
                  showCardPrompt={t('game.showCardToOpponent')}
                  isBotSeat={isAdmin && isBotId(player.id)}
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
      <div className={'md:hidden ' + mobileThemeCls + ' mobile-table-felt absolute pointer-events-none ' + (akTableEnabled ? 'inset-x-[10%] top-[10.6%] bottom-[6.6%]' : 'inset-x-[4%] top-[6%] bottom-[2%]')} style={akTableEnabled ? undefined : { perspective: '750px' }}>
        {/* Фетр/рейл — наклонённый фоновый слой (perspective+rotateX), как у ClubGG: верх уже / низ шире.
            AK-стол (референс Stitch) — плоский симметричный pill без 3D-наклона, transform не применяем.
            Контент (банк, борд, плашки) сюда НЕ кладём — иначе перекосит; он плоским слоем ниже. */}
        <div className="poker-oval-rail pointer-events-none" style={{ position: 'absolute', inset: 0, transform: akTableEnabled ? undefined : 'translateY(-4%) rotateX(24deg) scaleY(1.15)' }}>
          {/* spotlight на поверхности стола — наклоняется вместе с фетром */}
          <div className="poker-spotlight absolute inset-0 pointer-events-none rounded-[50%]" />
        </div>

        {/* Контент — плоский слой поверх наклонённого стола */}
        <div className="absolute inset-0 pointer-events-none">

          {/* Layer 1: центр — watermark + NLH-pill + roomName сверху, pot-plate ПОД данными стола
              (иерархия "данные → банк → борд"), community-cards внизу. */}
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-[54%] gap-2 pointer-events-none z-10 px-4">
            {akTableEnabled ? (
              <div className="relative -top-[76px] flex flex-col items-center gap-0.5 mt-2 select-none">
                <div className="w-10 h-10 border-2 border-white/50 rounded-full flex items-center justify-center mb-0.5 [box-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                  <span className="text-lg font-bold italic tracking-tighter text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">PH</span>
                </div>
                <div className="text-white/70 text-[9px] font-bold tracking-widest uppercase [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">POKER HUB</div>
              </div>
            ) : (
              <div className="poker-watermark poker-watermark--center select-none mt-2">POKER HUB</div>
            )}
            <div className={(akTableEnabled ? 'relative -top-[83px] ' : '') + 'text-emerald-700 text-[13px] font-bold uppercase tracking-widest [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]'}>
              {state.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'} {formatMoney(state.smallBlind)}/{formatMoney(state.bigBlind)}
            </div>
            {/* -top-[85px] на AK: без сдвига этот бейдж оставался в обычном потоке, пока NLH-строка
                выше и pot-блок ниже уводятся вверх на -83/-88px — бейдж наезжал на ChipStack банка.
                85 — между соседями по потоку, чтобы не перекрываться ни с тем, ни с другим. */}
            {state.tournamentId && (
              <div className={(akTableEnabled ? 'relative -top-[85px] ' : '') + 'text-blue-700 text-[9px] font-bold uppercase tracking-widest'}>
                {t('game.tournamentTable')}
              </div>
            )}
            {state.tournamentId && blindsRiseIn && state.tournamentNextBigBlind !== undefined && (
              <div className={(akTableEnabled ? 'relative -top-[96px] ' : '') + 'text-blue-700 text-[10px] font-bold mt-1 text-center'}>
                {t('game.blindsRiseIn', { time: blindsRiseIn, bb: formatMoney(state.tournamentNextBigBlind) })}
              </div>
            )}
            {state.pot > 0 && state.phase !== 'showdown' && (
              <div className={'flex flex-col items-center gap-2 ' + (akTableEnabled ? 'relative -top-[88px]' : '')}>
                <div className="pot-plate-mobile">
                  <div className="pot-label">{t('game.potMobile')}</div>
                  <div className="pot-value">{formatChips(state.pot, state.bigBlind, chipDisplay)}</div>
                </div>
                <ChipStack amount={state.pot} bigBlind={state.bigBlind} displayMode={chipDisplay} hideLabel />
              </div>
            )}
            {state.communityCards.length > 0 || (peekOn && state.futureBoard && state.futureBoard.length > 0) ? (
              <div className={'flex gap-1 flex-wrap justify-center max-w-full mt-1 ' + (akTableEnabled ? 'relative -top-[58px]' : '')}>
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
            ) : state.phase !== 'waiting' && !akTableEnabled ? (
              <div className="text-white/30 text-[10px] italic mt-1">{t('game.cardsNotRevealed')}</div>
            ) : null}
            {state.communityCardsB && state.communityCardsB.length > 0 && (
              <div className={'flex gap-1 flex-wrap justify-center max-w-full mt-1 ' + (akTableEnabled ? 'relative -top-[58px]' : '')}>
                {state.communityCardsB.map((c, i) => (
                  <Card key={'b-' + i} card={c} faceStyle="classic" backStyle={design.cardBackStyle} deck={cardDeck} size="sm" delay={i * 0.1} />
                ))}
              </div>
            )}
            {state.settlementMode === 'rimt' && (
              <div className="text-emerald-400/90 text-[9px] font-bold uppercase tracking-widest mt-0.5">{t('game.settlementRimt')}</div>
            )}
            {state.settlementMode === 'evCashout' && (
              <div className="text-emerald-400/90 text-[9px] font-bold uppercase tracking-widest mt-0.5">{t('game.settlementEvCashout')}</div>
            )}
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
                  // AK-скин: боковые места (left/right от центра) раздвинуты к краям экрана на 5px
                  // (top/bottom-center места, left===50, не трогаем).
                  left: akTableEnabled && left !== 50
                    ? 'calc(' + left + '% + ' + (left < 50 ? '-5px' : '5px') + ')'
                    : left + '%',
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
                  onShowCard={canShowCards && player.id === myId ? showCard : undefined}
                  showCardPrompt={t('game.showCardToOpponent')}
                  isBotSeat={isAdmin && isBotId(player.id)}
                  isCurrent={isCurr}
                  isWinner={!!winners && winners.includes(player.id)}
                  isDealer={player.id === dealerPlayerId && state.phase !== 'waiting'}
                  isSmallBlind={
                    player.id === sbPlayerId && state.phase !== 'waiting' && player.id !== dealerPlayerId
                  }
                  isBigBlind={player.id === bbPlayerId && state.phase !== 'waiting'}
                  hideRoleBadge
                  akSkin={akTableEnabled}
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

          {/* Layer 3: bet chips между seat и центром (z-10 < z-20 seats). По завершении улицы
              (и на showdown) анимированно стягиваются к банку в центре и растворяются —
              sweepingBets, см. useBetSweepAnimation/desktop-слой выше.
              AK-скин: не рендерим — банк в центре уже live-сумма (room.pot копится по каждой
              ставке на сервере), отдельные фишки у игроков дублируют её (по просьбе пользователя). */}
          {!akTableEnabled && mobileSeatPositions.map(({ player, chipLeft, chipTop }) => {
            const sweepAmount = sweepingBets[player.id];
            const amount = player.currentBet > 0 ? player.currentBet : sweepAmount;
            if (!amount) return null;
            const sweeping = player.currentBet <= 0 && !!sweepAmount;
            return (
              <div
                key={'chip-' + player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                style={{
                  left: sweeping ? '50%' : chipLeft + '%',
                  top: sweeping ? '50%' : chipTop + '%',
                  opacity: sweeping ? 0 : 1,
                  transition: 'left 0.9s ease-in-out, top 0.9s ease-in-out, opacity 0.9s ease-in-out',
                }}
              >
                <ChipStack
                  amount={amount}
                  bigBlind={state.bigBlind}
                  displayMode={chipDisplay}
                />
              </div>
            );
          })}

          {/* Layer 3b: AK-скин, только админ — сигнал «выиграю ли я» этой раздачей. Детерминированный
              (не вероятность): сервер сравнивает мою итоговую руку по known future-борду (admin-peek)
              против всех активных соперников — §0.1 не нарушается, это булев вывод из уже видимых
              этому сокету карт, не новая утечка. Угол слева от своего ряда (не chipLeft — у «меня»
              chipLeft всегда 50%, т.к. seat дед-центр, что сажало иконку в середину стола). */}
          {akTableEnabled && isAdmin && me && typeof me.willWin === 'boolean' && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
              style={{
                left: 'calc(18% - 68px)',
                top: 'calc(' + (mobileSeatPositions[0]?.top ?? 85) + '% + 15px)',
              }}
            >
              <div
                className={
                  'w-8 h-8 rounded-full backdrop-blur-md ring-1 ring-white/40 flex items-center justify-center shadow-lg ' +
                  (me.willWin
                    ? 'bg-emerald-500/70 shadow-[0_0_10px_2px_rgba(16,185,129,0.6)]'
                    : 'bg-red-500/70 shadow-[0_0_10px_2px_rgba(239,68,68,0.6)]')
                }
              >
                {me.willWin
                  ? <Check size={16} className="text-white" strokeWidth={3} />
                  : <X size={16} className="text-white" strokeWidth={3} />}
              </div>
            </div>
          )}

          {/* Layer 4: D/SB/BB-бейдж прижат к плашке со стороны центра стола (10% пути от seat) */}
          {/* Мой бейдж — не здесь, а в fixed-блоке моих карт (см. ниже). */}
          {state.phase !== 'waiting' && mobileSeatPositions.map(({ player, dealerLeft, dealerTop }) => {
            const isDealer = player.id === dealerPlayerId;
            const isSB = player.id === sbPlayerId && player.id !== dealerPlayerId;
            const isBB = player.id === bbPlayerId;
            const role = isDealer ? 'D' : isSB ? 'SB' : isBB ? 'BB' : null;
            if (!role || player.id === myId) return null;
            // Дилер/SB/BB — одинаковый размер жетона, отличается только цвет.
            const cls = isDealer
              ? 'min-w-[17px] h-[17px] text-[8px] bg-white text-gray-900 ring-2 ring-gray-300/80'
              : isSB
              ? 'min-w-[17px] h-[17px] text-[8px] bg-sky-500 text-white ring-1 ring-black/30'
              : 'min-w-[17px] h-[17px] text-[8px] bg-purple-500 text-white ring-1 ring-black/30';
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
        <div className={'md:hidden fixed left-1/2 -translate-x-1/2 z-30 flex items-end gap-2.5 pointer-events-none scale-[0.69] origin-bottom ' + (akTableEnabled ? 'bottom-[71px]' : 'bottom-[82px]')}>
          {/* Слева: аватар + тег последнего действия (единый зелёный, референс AK Poker) + ник/стек. */}
          <div className="relative flex flex-col items-center shrink-0">
            <div
              className={
                'relative w-14 h-14 rounded-full bg-gradient-to-br overflow-hidden shadow ' +
                avatarColor(me.username) + ' ' +
                (isMyTurn ? 'ring-2 ring-poker-gold' : me.disconnected ? 'ring-1 ring-orange-500/60' : 'ring-1 ring-white/15')
              }
            >
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(me.avatar || me.id)} />
            </div>
            {/* Тег действия — оверлап на аватаре снизу-слева, как на референсе. Та же эфемерная
                бабл-система, что и у соперников (useEphemeralBubbles), но единый зелёный вариант. */}
            <div className="absolute -bottom-1 -left-1.5 z-10">
              <AnimatePresence mode="popLayout">
                {actionBubbles[me.id] && (
                  <ActionBubble
                    key={'a-' + actionBubbles[me.id].key}
                    action={actionBubbles[me.id].action}
                    amount={actionBubbles[me.id].amount}
                    bigBlind={state.bigBlind}
                    displayMode={chipDisplay}
                    variant="hero"
                  />
                )}
              </AnimatePresence>
            </div>
            {/* Ник + стек — чёрная плашка под аватаром (перенесена из отдельной жёлтой пилюли). */}
            <div className="mt-1 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur border border-white/15 flex flex-col items-center leading-tight min-w-[64px]">
              <span className="text-[11px] font-semibold text-white truncate max-w-[76px]">
                {me.displayName || me.username}
              </span>
              <span className="text-[13px] font-black text-amber-300 tabular-nums">
                {formatChips(me.chips, state.bigBlind, chipDisplay)}
              </span>
            </div>
          </div>

          {/* Справа: карты + подсказка + шкала. */}
          <div className="flex flex-col items-center">
            {me.cards.length > 0 && (
              <div className="relative flex gap-1.5 scale-[0.81] origin-bottom">
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
                {/* Таймер своего хода — рамка вокруг моих карт (см. CardsTurnTimer). */}
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
                      ? 'bg-white text-gray-900 ring-2 ring-gray-300/80 min-w-[24px] h-[24px] text-[12px]'
                      : role === 'SB'
                      ? 'bg-sky-500 text-white ring-1 ring-black/30 min-w-[24px] h-[24px] text-[12px]'
                      : 'bg-purple-500 text-white ring-1 ring-black/30 min-w-[24px] h-[24px] text-[12px]';
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
            {/* Подсказка под моими картами: текущая комбинация + шанс на выигрыш (по тумблеру).
                Под AK-скином текст не показываем — там только шкала (по просьбе пользователя). */}
            {!akTableEnabled && gameSettings.handHintEnabled && me.handHint && (
              <span className="mt-1.5 px-3 py-0.5 rounded-full bg-black/75 backdrop-blur border border-emerald-400/30 text-emerald-300 text-[15px] font-bold whitespace-nowrap">
                {me.handHint}
                {typeof me.winChance === 'number' ? ' · ' + me.winChance + '%' : ''}
              </span>
            )}
            {/* Шкала силы руки — сегментированный индикатор (референс AK Poker), под подсказкой/картами.
                Режим переключается в Настройках Игры: 'category' — по типу комбинации (handRank,
                не зависит от борда/соперников); 'equity' — по шансу на выигрыш (winChance). На
                showdown/между раздачами winChance не считается (undefined) — шкала в equity-режиме
                на это время прячется, а не показывает устаревшее число. */}
            {gameSettings.handHintEnabled && (() => {
              const value =
                gameSettings.handStrengthMode === 'equity'
                  ? typeof me.winChance === 'number' ? (me.winChance / 100) * SEGMENTS : undefined
                  : me.handRank;
              if (typeof value !== 'number') return null;
              return (
                <div className={'mt-1.5 ' + (akTableEnabled ? 'relative top-[3px]' : '')}>
                  <HandStrengthMeter rank={value} />
                </div>
              );
            })()}
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
          akSkin={akTableEnabled}
        />
      )}

      {me && !me.isFolded && !isMyTurn && state && state.phase !== 'waiting' && state.phase !== 'showdown' && (
        <PreSelectPanel value={preselect} onChange={setPreselect} akSkin={akTableEnabled} />
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
          tournamentId={state.tournamentId}
          myId={myId}
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

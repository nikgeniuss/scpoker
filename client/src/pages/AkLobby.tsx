import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Coins, Plus, Gift, Bell, Dices, Shield, DollarSign } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../config/apiErrors';
import type { RoomInfo, TournamentInfo } from '@poker-room/shared';
import { useAuthStore } from '../store/authStore';
import { useInboxStore } from '../store/inboxStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useJoinFlow } from '../hooks/useJoinFlow';
import { useLobbyData } from '../hooks/useLobbyData';
import { CreateRoomModal } from '../components/lobby/CreateRoomModal';
import { PasswordModal } from '../components/lobby/PasswordModal';
import { BuyInModal } from '../components/lobby/BuyInModal';
import { formatMoney } from '../config/chipFormat';
import { avatarConfig } from '../utils/avatar';
import { countryFlag } from '../utils/country';

type AkTab = 'mtt' | 'holdem' | 'casino';

// Главный экран AK-скина ("/lobby" при appTheme='ak', рендерится в LobbyGate.tsx). Верстка по
// референс-скриншоту AK Poker — шапка-профиль + табы MTT/Hold'em/Казино + список карточек.
// Доменная логика полностью переиспользована: useLobbyData/useJoinFlow (столы, как в
// LobbyRedesign.tsx) и useTournamentStore (турниры, как в Tournaments.tsx). Chrome (top/bottom
// навбар) рисует Layout.tsx → AkChrome — здесь только контент страницы.
export const AkLobby = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const inboxUnread = useInboxStore((s) => s.unread);

  // Дефолт — Hold'em (кэш-столы), не MTT: в остальном приложении (POKER HUB) лобби без вкладок
  // сразу показывает играющие столы, турниры — отдельная страница. Если по умолчанию открывать
  // MTT, активные столы прячутся за вкладкой и выглядят как будто их нет.
  const [tab, setTab] = useState<AkTab>('holdem');

  const myId = user?.id ?? null;
  const join = useJoinFlow(myId);
  const { rooms, showCreate, setShowCreate, createRoom } = useLobbyData(join.reset);
  const roomsSorted = [...rooms].sort((a, b) => b.currentPlayers - a.currentPlayers);

  // Фильтр по формату стола — как пилюли «Все/NLH/6+/AOF» на референсе, но под реальные форматы
  // scpoker (только nlh/shortdeck, см. BRAND.md «Форматы»), не выдумываем 6+/AOF — их тут нет.
  const [formatFilter, setFormatFilter] = useState<'all' | 'nlh' | 'shortdeck'>('all');
  const roomsFiltered = formatFilter === 'all' ? roomsSorted : roomsSorted.filter((r) => r.format === formatFilter);

  const { tournaments, fetchTournaments, register, unregister } = useTournamentStore();
  const activeTournaments = tournaments.filter((trn) => trn.status !== 'cancelled');

  // Список турниров — REST-поллинг (та же схема, что в Tournaments.tsx), не зависит от активного таба.
  useEffect(() => {
    if (!token) return;
    fetchTournaments(token);
    const id = setInterval(() => fetchTournaments(token), 5000);
    return () => clearInterval(id);
  }, [token, fetchTournaments]);

  const handleRegister = async (id: string) => {
    if (!token) return;
    const result = await register(token, id);
    if (!result.ok) toast.error(apiErrorMessage(result.error, t));
  };
  const handleUnregister = async (id: string) => {
    if (!token) return;
    const result = await unregister(token, id);
    if (!result.ok) toast.error(apiErrorMessage(result.error, t));
  };
  const goToTable = (trn: TournamentInfo) => {
    const myTableId = trn.entries.find((e) => e.userId === myId && e.status === 'playing')?.tableId;
    if (myTableId) navigate('/game/' + myTableId);
  };

  const roomItemProps = (room: RoomInfo): AkRoomItemProps => ({
    room,
    imIn: !!myId && room.playerIds.includes(myId),
    myQueuePos: myId ? room.waitlistIds.indexOf(myId) + 1 : 0,
    onJoin: () => join.handleJoin(room),
    onQueue: () => join.handleQueue(room),
    onLeaveQueue: () => join.handleLeaveQueue(room),
  });

  const TABS: { id: AkTab; label: string }[] = [
    { id: 'mtt', label: t('ak.tabMtt') },
    { id: 'holdem', label: t('ak.tabHoldem') },
    { id: 'casino', label: t('ak.tabCasino') },
  ];

  return (
    <div className="ak-font min-h-[100dvh] bg-ak-bg pb-6">
      {/* Шапка-профиль + табы — «липкие» под верхним навбаром AkChrome (h-16 = top-16) */}
      <div className="sticky top-16 z-10 bg-ak-bg/95 backdrop-blur-sm border-b border-ak-navy/10">
        <div className="max-w-xl mx-auto px-3 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 min-w-0 min-h-[44px] text-left"
            >
              <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 ring-2 ring-white shadow-sm">
                <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(user?.avatarSeed || user?.id || 'guest')} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-ak-navy text-sm truncate">{user?.username ?? '—'}</span>
                  {!!user?.country && <span className="text-xs">{countryFlag(user.country)}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-ak-text-muted truncate">ID:{user?.publicId ?? user?.id?.slice(0, 8) ?? '—'}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-ak-gold/15 text-ak-gold text-[9px] font-black uppercase tracking-wide shrink-0">
                    {t('ak.vipLevel', { level: 0 })}
                  </span>
                </div>
              </div>
            </button>

            <button
              onClick={() => navigate('/ak-promotions')}
              title={t('ak.promotions')}
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm"
            >
              <Gift size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={() => navigate('/wallet')}
              className="flex-1 min-h-[44px] flex items-center justify-between gap-2 pl-3.5 pr-1.5 rounded-full bg-ak-navy text-white text-sm font-bold shadow-sm"
            >
              $ {formatMoney(user?.chips ?? 0)}
              <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Plus size={15} />
              </span>
            </button>
            <button
              onClick={() => navigate('/inbox')}
              className="shrink-0 min-h-[44px] flex items-center gap-1.5 px-3.5 rounded-full bg-white border border-ak-navy/10 text-ak-text text-sm font-bold shadow-sm"
            >
              <Bell size={15} className="text-ak-navy" /> {inboxUnread}
            </button>
          </div>

          {/* Табы MTT / Hold'em / Казино */}
          <div className="flex mt-3 -mb-2 border-b border-ak-navy/10">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={
                  'flex-1 min-h-[44px] flex items-center justify-center text-sm font-bold border-b-2 transition-colors ' +
                  (tab === id ? 'text-ak-navy border-ak-navy' : 'text-ak-text-muted border-transparent')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-3 pt-3 space-y-2.5">
        {tab === 'mtt' && (
          activeTournaments.length === 0 ? (
            <AkEmptyState icon={<Trophy size={44} />} text={t('ak.emptyTournaments')} />
          ) : (
            activeTournaments.map((trn) => (
              <AkTournamentCard
                key={trn.id}
                trn={trn}
                myId={myId}
                lang={i18n.language}
                onRegister={() => handleRegister(trn.id)}
                onUnregister={() => handleUnregister(trn.id)}
                onGoToTable={() => goToTable(trn)}
              />
            ))
          )
        )}

        {tab === 'holdem' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    ['all', t('lobby.formatAll')],
                    ['nlh', 'NLH'],
                    ['shortdeck', t('lobby.formatShortdeck')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFormatFilter(id)}
                    className={
                      'min-h-[36px] px-3.5 rounded-full text-xs font-bold whitespace-nowrap ' +
                      (formatFilter === id ? 'bg-ak-navy text-white' : 'bg-ak-card border border-ak-navy/10 text-ak-text-muted')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5 px-4 rounded-full bg-ak-navy text-white text-xs font-bold shadow-sm"
              >
                <Plus size={14} /> {t('ak.createTable')}
              </button>
            </div>
            {roomsFiltered.length === 0 ? (
              <AkEmptyState icon={<Coins size={44} />} text={t('ak.emptyRooms')} />
            ) : (
              roomsFiltered.map((room) => <AkRoomCard key={room.id} {...roomItemProps(room)} />)
            )}
          </>
        )}

        {tab === 'casino' && (
          <AkEmptyState icon={<Dices size={44} />} text={t('ak.casinoComingSoon')} />
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onSubmit={createRoom} />}
        {join.pendingJoin?.stage === 'password' && (
          <PasswordModal onClose={join.reset} onSubmit={join.handlePasswordSubmit} />
        )}
        {join.pendingJoin?.stage === 'buyin' && (
          <BuyInModal room={join.pendingJoin.room} onClose={join.reset} onSubmit={join.handleBuyInSubmit} />
        )}
      </AnimatePresence>
    </div>
  );
};

function AkEmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-ak-text-muted">
      <div className="text-ak-navy/15">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// Тот же паттерн, что в TournamentCard.tsx: Date.now() вынесен в отдельные модульные функции
// (не инлайн в теле компонента) — иначе eslint react-hooks/purity ругается на вызов impure-функции
// при рендере.
function formatScheduled(ts: number, lang: string): string {
  return new Date(ts).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function isRegNotOpenYet(trn: TournamentInfo): boolean {
  return trn.status === 'registering' && !!trn.regOpensAt && Date.now() < trn.regOpensAt;
}

function isLateRegOpen(trn: TournamentInfo): boolean {
  if (trn.type !== 'mtt' || trn.status !== 'running' || !trn.startedAt) return false;
  return Date.now() < trn.startedAt + trn.lateRegMinutes * 60_000;
}

interface AkTournamentCardProps {
  trn: TournamentInfo;
  myId: string | null;
  lang: string;
  onRegister: () => void;
  onUnregister: () => void;
  onGoToTable: () => void;
}

function AkTournamentCard({ trn, myId, lang, onRegister, onUnregister, onGoToTable }: AkTournamentCardProps) {
  const { t } = useTranslation();
  // С ре-энтри у игрока может быть несколько entries — активная (не eliminated) определяет UI.
  const myEntry = myId ? trn.entries.find((e) => e.userId === myId && e.status !== 'eliminated') : undefined;
  const isFull = trn.type === 'sng' && trn.entries.length >= trn.tableSize;
  const regNotOpenYet = isRegNotOpenYet(trn);
  const lateRegOpen = isLateRegOpen(trn);

  const dateLabel = trn.scheduledStartAt ? formatScheduled(trn.scheduledStartAt, lang) : t('ak.fillByPlayers');

  let action: React.ReactNode;
  const pill = 'min-h-[44px] px-4 rounded-full text-xs font-bold whitespace-nowrap flex items-center justify-center';
  if (trn.status === 'registering') {
    if (myEntry) {
      action = <button onClick={onUnregister} className={pill + ' bg-ak-bg-alt text-ak-text-muted'}>{t('ak.unregister')}</button>;
    } else if (regNotOpenYet) {
      action = <span className={pill + ' bg-ak-bg-alt text-ak-text-muted'}>{t('tournamentCard.regOpensAt', { time: formatScheduled(trn.regOpensAt!, lang) })}</span>;
    } else {
      action = (
        <button
          onClick={onRegister}
          disabled={isFull}
          className={pill + ' ' + (isFull ? 'bg-ak-bg-alt text-ak-text-muted' : 'bg-ak-navy text-white')}
        >
          {isFull ? t('tournamentCard.tableFull') : t('ak.register')}
        </button>
      );
    }
  } else if (trn.status === 'running' && myEntry?.status === 'playing') {
    action = <button onClick={onGoToTable} className={pill + ' bg-ak-teal text-white'}>{t('tournamentCard.backToTable')}</button>;
  } else if (trn.status === 'running' && lateRegOpen && !myEntry) {
    action = <button onClick={onRegister} className={pill + ' bg-ak-navy text-white'}>{t('tournamentCard.registerLateReg')}</button>;
  } else {
    action = (
      <span className={pill + ' bg-ak-bg-alt text-ak-text-muted'}>
        {trn.status === 'running' ? t('tournamentCard.statusRunning') : t('tournamentCard.statusFinished')}
      </span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[13px] bg-ak-card shadow-sm border border-ak-navy/5 p-3.5"
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="font-bold text-ak-navy text-sm truncate">{trn.name}</span>
        <span className="text-ak-text-muted text-sm">·</span>
        <span className="text-ak-text text-sm font-semibold">${formatMoney(trn.buyIn)}</span>
        <span className="text-ak-text-muted text-sm">·</span>
        {trn.guaranteedPrizePool ? (
          <span className="text-ak-red text-sm font-bold">${formatMoney(trn.guaranteedPrizePool)} GTD</span>
        ) : (
          <span className="text-ak-text text-sm font-semibold">${formatMoney(trn.prizePool)}</span>
        )}
        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-ak-bg-alt text-ak-navy shrink-0">
          {trn.type === 'mtt' ? 'MTT' : 'SNG'}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <span className="inline-flex items-center gap-1 text-ak-gold font-bold text-sm">
          <Trophy size={15} /> ${formatMoney(trn.prizePool)}
        </span>
        <span className="inline-flex items-center gap-1 text-ak-text-muted text-sm">
          <Users size={14} /> {trn.entries.length}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-ak-text text-sm font-semibold">
          <Coins size={14} className="text-ak-text-muted" /> ${formatMoney(trn.buyIn)}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="text-[11px] text-ak-text-muted">{dateLabel}</span>
        {action}
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-ak-bg-alt text-[10px] text-ak-text-muted">
        <span>{t('tournamentCard.prizePool')}: ${formatMoney(trn.prizePool)}</span>
        <span>{t('ak.minEntries', { count: 2 })}</span>
      </div>
    </motion.div>
  );
}

interface AkRoomItemProps {
  room: RoomInfo;
  imIn: boolean;
  myQueuePos: number;
  onJoin: () => void;
  onQueue: () => void;
  onLeaveQueue: () => void;
}

// Кнопка действия со столом — та же логика, что RoomActionButton в LobbyRedesign.tsx
// (реконнект/войти/встать в очередь/выйти из очереди), в цветах AK.
function AkRoomActionButton({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue }: AkRoomItemProps) {
  const { t } = useTranslation();
  const queueCount = room.waitlistIds.length;
  const isFull = room.currentPlayers >= room.maxPlayers || queueCount > 0;
  const pill = 'min-h-[44px] px-4 rounded-full text-xs font-bold whitespace-nowrap flex items-center justify-center';

  if (imIn) {
    return <button onClick={onJoin} className={pill + ' bg-ak-teal text-white'}>{t('lobby.return')}</button>;
  }
  if (!isFull) {
    return <button onClick={onJoin} className={pill + ' bg-ak-navy text-white'}>{t('lobby.join')}</button>;
  }
  if (myQueuePos > 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="min-h-[44px] px-3 rounded-full text-[10px] font-bold flex items-center bg-ak-gold/15 text-ak-gold whitespace-nowrap">
          {queueCount > 1 ? t('lobby.inQueueOf', { pos: myQueuePos, count: queueCount }) : t('lobby.inQueue', { pos: myQueuePos })}
        </span>
        <button onClick={onLeaveQueue} className="min-h-[44px] px-3 rounded-full text-[10px] font-bold bg-ak-bg-alt text-ak-text-muted">
          {t('lobby.leaveQueue')}
        </button>
      </div>
    );
  }
  return (
    <button onClick={onQueue} className={pill + ' bg-ak-gold text-ak-navy'}>
      {queueCount > 0 ? t('lobby.joinQueueWaiting', { count: queueCount }) : t('lobby.joinQueue')}
    </button>
  );
}

// Карточка стола — переверстана по живому референсу (реальный экран Hold'em в AK Poker, не
// только их MTT-карточки): бейдж формата отдельно слева от названия, 3 колонки иконка+значение+
// подпись (блайнды/игроки/мин.бай-ин — только реальные поля RoomInfo, ничего не выдумываем —
// у них ещё есть иконка-таймер непонятного назначения без аналога в данных scpoker, не копируем
// её вслепую), статус текстом без плашки (красный конфликтовал бы с «HOT» у промо-баннеров AK).
function AkRoomCard({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue }: AkRoomItemProps) {
  const { t } = useTranslation();
  const isPlaying = room.status === 'playing';
  const minBuyIn = room.bigBlind * room.buyInMinBb;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={'rounded-[13px] bg-ak-card shadow-sm border p-3.5 ' + (imIn ? 'border-ak-teal/40' : 'border-ak-navy/5')}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={'px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 text-white ' + (room.format === 'shortdeck' ? 'bg-ak-teal' : 'bg-ak-navy')}>
          {room.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}
        </span>
        <span className="font-bold text-ak-navy text-sm truncate">{room.name}</span>
        {room.hasPassword && <Shield size={12} className="text-ak-gold shrink-0" />}
        <span className={'ml-auto text-[10px] font-bold shrink-0 ' + (isPlaying ? 'text-ak-gold' : 'text-ak-green')}>
          {isPlaying ? t('lobby.playing') : t('lobby.waiting')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3 py-2 rounded-[5px] bg-ak-bg">
        <div className="flex flex-col items-center gap-0.5">
          <Coins size={15} className="text-ak-gold" />
          <span className="text-ak-navy font-bold text-xs tabular-nums">{formatMoney(room.smallBlind)}/{formatMoney(room.bigBlind)}</span>
          <span className="text-ak-text-muted text-[9px]">Блайнды</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 border-x border-ak-navy/10">
          <Users size={15} className="text-ak-navy" />
          <span className="text-ak-text font-bold text-xs">{room.currentPlayers}/{room.maxPlayers}</span>
          <span className="text-ak-text-muted text-[9px]">Игроки</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <DollarSign size={15} className="text-ak-green" />
          <span className="text-ak-text font-bold text-xs">{formatMoney(minBuyIn)}</span>
          <span className="text-ak-text-muted text-[9px]">Мин. Бай-Ин</span>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <AkRoomActionButton room={room} imIn={imIn} myQueuePos={myQueuePos} onJoin={onJoin} onQueue={onQueue} onLeaveQueue={onLeaveQueue} />
      </div>
    </motion.div>
  );
}

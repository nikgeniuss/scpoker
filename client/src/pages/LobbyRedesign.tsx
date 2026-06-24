import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Dices, Trophy, Eye, Lock } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import type { RoomInfo } from '@poker-room/shared';
import { useAuthStore } from '../store/authStore';
import { useJoinFlow } from '../hooks/useJoinFlow';
import { useLobbyData } from '../hooks/useLobbyData';
import { useRoomFilters } from '../hooks/useRoomFilters';
import { useClubStore } from '../store/clubStore';
import { CreateRoomModal } from '../components/lobby/CreateRoomModal';
import { PasswordModal } from '../components/lobby/PasswordModal';
import { BuyInModal } from '../components/lobby/BuyInModal';
import { BadBeatBanner } from '../components/lobby/BadBeatBanner';
import { loadGameSettings } from '../config/gameSettings';
import { formatMoney } from '../config/chipFormat';
import { avatarConfig } from '../utils/avatar';

// Редизайн лобби под топ-румы (GGPoker/ClubGG) — функциональная замена Lobby.tsx,
// та же доменная логика (хуки/модалки), новая визуальная подача. Какую из двух версий
// видят игроки — переключатель в админке («Настройки» → «Дизайн лобби»), см. LobbyGate.tsx.
export const LobbyRedesign = () => {
  const { t } = useTranslation();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const myClub = useClubStore((s) => s.myClub);
  const navigate = useNavigate();
  const join = useJoinFlow(myId);
  const { rooms, showCreate, setShowCreate, createRoom } = useLobbyData(join.reset);
  const [view, setView] = useState<'list' | 'grid'>('list');

  const myClubId = myClub?.id ?? null;
  const clubRooms = myClubId ? rooms.filter((r) => r.clubId === myClubId) : [];
  const publicRooms = rooms.filter((r) => !r.clubId);

  const {
    search, setSearch,
    formatTab, setFormatTab,
    blindPreset, setBlindPreset,
    filtered: filteredPublic, onlineCount, tableCount,
  } = useRoomFilters(rooms, myId);
  const filtered = filteredPublic.filter((r) => !r.clubId);

  // Самый оживлённый из видимых столов — крупная карточка сверху (как «live table» в GG-лобби).
  const busiest = filtered.length > 0 ? filtered.reduce((a, b) => (b.currentPlayers > a.currentPlayers ? b : a)) : undefined;
  const featured = busiest && busiest.currentPlayers > 0 ? busiest : undefined;
  const rest = featured ? filtered.filter((r) => r.id !== featured.id) : filtered;

  useEffect(() => {
    if (!loadGameSettings().soundEnabled) return;
    const audio = new Audio('/sounds/lobby.mp3');
    audio.loop = true;
    audio.volume = 0.25;
    const tryPlay = () => audio.play().catch(() => {});
    audio.play().catch(() => {
      document.addEventListener('click', tryPlay, { once: true });
      document.addEventListener('touchstart', tryPlay, { once: true });
    });
    return () => {
      audio.pause();
      audio.src = '';
      document.removeEventListener('click', tryPlay);
      document.removeEventListener('touchstart', tryPlay);
    };
  }, []);

  const itemProps = (room: RoomInfo) => ({
    room,
    imIn: !!myId && room.playerIds.includes(myId),
    myQueuePos: myId ? room.waitlistIds.indexOf(myId) + 1 : 0,
    onJoin: () => join.handleJoin(room),
    onQueue: () => join.handleQueue(room),
    onLeaveQueue: () => join.handleLeaveQueue(room),
    onObserve: () => navigate('/game/' + room.id + '?observe=1'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-[#070707] z-0" />
      <div className="container mx-auto px-4 pt-0 pb-12 relative z-10 space-y-5">
        <BadBeatBanner />

        {/* Шапка: счётчики + лидеры слева, поиск + создать справа */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Stat icon={<Users size={12} />} label={t('lobby.online')} value={String(onlineCount)} />
            <Stat icon={<Dices size={12} />} label={tableCount === 1 ? t('lobby.tableSingular') : t('lobby.tablePlural')} value={String(tableCount)} />
            <button
              onClick={() => navigate('/leaderboard')}
              title={t('lobby.leaderboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg hover:bg-black/60 transition-colors"
            >
              <Trophy size={12} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-40 sm:w-56">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('lobby.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 font-bold text-white text-sm shadow-lg shadow-emerald-500/30 shrink-0"
            >
              <Plus size={14} />
              {t('lobby.createRoom')}
            </motion.button>
          </div>
        </div>

        {/* Табы формата + пресеты блайндов + список/карточки */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
            {([
              { id: 'all', label: t('lobby.formatAll') },
              { id: 'nlh', label: 'NLH' },
              { id: 'shortdeck', label: t('lobby.formatShortdeck') },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFormatTab(tab.id)}
                className={
                  'px-4 py-1.5 rounded-lg text-sm font-bold transition-all ' +
                  (formatTab === tab.id ? 'bg-emerald-500 text-black shadow' : 'text-gray-400 hover:text-white')
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto max-w-full">
            {([
              { id: 'all', label: t('lobby.stakeAll') },
              { id: 'micro', label: t('lobby.stakeMicro') },
              { id: 'low', label: t('lobby.stakeLow') },
              { id: 'medium', label: t('lobby.stakeMedium') },
              { id: 'high', label: t('lobby.stakeHigh') },
            ] as const).map((p) => (
              <button
                key={p.id}
                onClick={() => setBlindPreset(p.id)}
                className={
                  'px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ' +
                  (blindPreset === p.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10')
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto inline-flex p-1 rounded-xl bg-white/5 border border-white/10 shrink-0">
            <button
              onClick={() => setView('list')}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (view === 'list' ? 'bg-white/15 text-white' : 'text-gray-500')}
            >
              Список
            </button>
            <button
              onClick={() => setView('grid')}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (view === 'grid' ? 'bg-white/15 text-white' : 'text-gray-500')}
            >
              Карточки
            </button>
          </div>
        </div>

        {/* Клубные столы — только для членов клуба */}
        {clubRooms.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                {t('lobby.clubRooms')} · {myClub?.name}
              </span>
              <span className="text-[10px] text-gray-600">{clubRooms.length}</span>
            </div>
            <RoomList view={view} rooms={clubRooms} itemProps={itemProps} />
          </div>
        )}

        {/* Самый оживлённый стол */}
        {featured && <FeaturedRoom {...itemProps(featured)} />}

        {publicRooms.length === 0 ? (
          <EmptyState icon="🃏" text={t('lobby.emptyTitle')} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" text={t('lobby.emptyFiltered')} />
        ) : (
          <RoomList view={view} rooms={rest} itemProps={itemProps} />
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateRoomModal onClose={() => setShowCreate(false)} onSubmit={createRoom} />
        )}
        {join.pendingJoin?.stage === 'password' && (
          <PasswordModal onClose={join.reset} onSubmit={join.handlePasswordSubmit} />
        )}
        {join.pendingJoin?.stage === 'buyin' && (
          <BuyInModal room={join.pendingJoin.room} onClose={join.reset} onSubmit={join.handleBuyInSubmit} />
        )}
      </AnimatePresence>
    </>
  );
};

interface RoomItemProps {
  room: RoomInfo;
  imIn: boolean;
  myQueuePos: number;
  onJoin: () => void;
  onQueue: () => void;
  onLeaveQueue: () => void;
  onObserve: () => void;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-lg">
      {icon} <span className="text-white/90">{value}</span> <span className="text-[10px] opacity-60 font-normal">{label}</span>
    </span>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-gray-500 mt-20">
      <p className="text-6xl mb-4">{icon}</p>
      <p>{text}</p>
    </motion.div>
  );
}

function RoomList({ view, rooms, itemProps }: { view: 'list' | 'grid'; rooms: RoomInfo[]; itemProps: (r: RoomInfo) => RoomItemProps }) {
  if (view === 'list') {
    return (
      <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
        {rooms.map((r) => <RoomRow key={r.id} {...itemProps(r)} />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rooms.map((r) => <RoomGridCard key={r.id} {...itemProps(r)} />)}
    </div>
  );
}

// Кнопка действия со столом: войти/вернуться/встать в очередь/выйти из очереди — те же
// правила, что в RoomCard.tsx (имёт ли смысл реконнект, занят ли стол, моя позиция в очереди).
function RoomActionButton({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue, fullWidth }: Omit<RoomItemProps, 'onObserve'> & { fullWidth?: boolean }) {
  const { t } = useTranslation();
  const queueCount = room.waitlistIds.length;
  const isFull = room.currentPlayers >= room.maxPlayers || queueCount > 0;
  const base = (fullWidth ? 'w-full ' : 'shrink-0 ') + 'px-4 py-2 rounded-xl font-bold text-sm transition-all';

  if (imIn) {
    return (
      <button onClick={onJoin} className={base + ' bg-gradient-to-r from-emerald-400 to-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/30'}>
        {t('lobby.return')}
      </button>
    );
  }
  if (!isFull) {
    return (
      <button onClick={onJoin} className={base + ' bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30'}>
        {t('lobby.join')}
      </button>
    );
  }
  if (myQueuePos > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 px-3 py-2 rounded-xl font-bold text-xs text-center bg-amber-500/15 text-amber-300 border border-amber-500/40 whitespace-nowrap">
          {queueCount > 1 ? t('lobby.inQueueOf', { pos: myQueuePos, count: queueCount }) : t('lobby.inQueue', { pos: myQueuePos })}
        </span>
        <button onClick={onLeaveQueue} className="px-3 py-2 rounded-xl font-bold text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
          {t('lobby.leaveQueue')}
        </button>
      </div>
    );
  }
  return (
    <button onClick={onQueue} className={base + ' bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30'}>
      {queueCount > 0 ? t('lobby.joinQueueWaiting', { count: queueCount }) : t('lobby.joinQueue')}
    </button>
  );
}

function RoomRow({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue, onObserve }: RoomItemProps) {
  const { t } = useTranslation();
  const isPlaying = room.status === 'playing';

  return (
    <div className={'flex gap-3 px-4 py-3 transition-colors ' + (imIn ? 'bg-emerald-900/20' : 'bg-white/[0.02] hover:bg-white/[0.05]')}>
      <div className={'w-1 self-stretch rounded-full shrink-0 ' + (room.format === 'shortdeck' ? 'bg-amber-500' : 'bg-emerald-500')} />

      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="w-28 sm:w-32 shrink-0">
          <div className="text-base font-black text-white tabular-nums">{formatMoney(room.smallBlind)}/{formatMoney(room.bigBlind)}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{room.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-white truncate">{room.name}</span>
            {room.hasPassword && <Lock size={12} className="text-amber-400 shrink-0" />}
            {imIn && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500 text-black uppercase tracking-wider shrink-0">
                {t('lobby.youAreHere')}
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {t('lobby.createdBy')} {room.createdBy} · {room.buyInMinBb}-{room.buyInMaxBb}BB
            {room.rake.percent > 0 && <> · {t('lobby.rake')} {room.rake.percent}%</>}
          </div>
        </div>

        <div className="hidden sm:flex items-center -space-x-1.5 shrink-0">
          {room.players.slice(0, 5).map((p) => (
            <div key={p.id} title={p.username} className="w-6 h-6 rounded-full overflow-hidden ring-2 ring-[#070707]">
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(p.avatar || p.id)} />
            </div>
          ))}
        </div>

        <span className={'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ' + (isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')}>
          {isPlaying ? t('lobby.playing') : t('lobby.waiting')}
        </span>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className={'text-sm font-bold tabular-nums shrink-0 ' + (room.currentPlayers >= room.maxPlayers ? 'text-red-400' : 'text-emerald-400')}>
            {room.currentPlayers}/{room.maxPlayers}
          </span>
          <RoomActionButton room={room} imIn={imIn} myQueuePos={myQueuePos} onJoin={onJoin} onQueue={onQueue} onLeaveQueue={onLeaveQueue} />
          {!imIn && (
            <button onClick={onObserve} title={t('lobby.observe')} className="shrink-0 hidden sm:flex px-3 py-2 rounded-xl text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 items-center gap-1.5">
              <Eye size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomGridCard({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue, onObserve }: RoomItemProps) {
  const { t } = useTranslation();
  const isPlaying = room.status === 'playing';

  return (
    <div className={'rounded-2xl border p-4 space-y-3 transition-colors ' + (imIn ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-white/10 bg-gray-900/55 hover:border-emerald-500/40')}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-white truncate">{room.name}</h3>
            {room.hasPassword && <Lock size={12} className="text-amber-400 shrink-0" />}
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{room.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}</span>
        </div>
        <span className={'text-sm font-bold tabular-nums shrink-0 ' + (room.currentPlayers >= room.maxPlayers ? 'text-red-400' : 'text-emerald-400')}>
          {room.currentPlayers}/{room.maxPlayers}
        </span>
      </div>

      <div className="text-xl font-black text-amber-300 tabular-nums">{formatMoney(room.smallBlind)} / {formatMoney(room.bigBlind)}</div>

      <div className="text-[11px] text-gray-500">
        {room.buyInMinBb}-{room.buyInMaxBb}BB
        {room.rake.percent > 0 && <> · {t('lobby.rake')} {room.rake.percent}%</>}
        {' · '}
        <span className={isPlaying ? 'text-red-400' : 'text-emerald-400'}>{isPlaying ? t('lobby.playing') : t('lobby.waiting')}</span>
      </div>

      <div className="flex items-center -space-x-1.5">
        {room.players.slice(0, 6).map((p) => (
          <div key={p.id} title={p.username} className="w-6 h-6 rounded-full overflow-hidden ring-2 ring-gray-900">
            <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(p.avatar || p.id)} />
          </div>
        ))}
      </div>

      <RoomActionButton room={room} imIn={imIn} myQueuePos={myQueuePos} onJoin={onJoin} onQueue={onQueue} onLeaveQueue={onLeaveQueue} fullWidth />

      {!imIn && (
        <button onClick={onObserve} className="w-full py-1.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5">
          <Eye size={13} /> {t('lobby.observe')}
        </button>
      )}
    </div>
  );
}

function FeaturedRoom({ room, imIn, myQueuePos, onJoin, onQueue, onLeaveQueue, onObserve }: RoomItemProps) {
  const { t } = useTranslation();

  return (
    <div className="relative rounded-2xl border border-amber-500/40 bg-gradient-to-br from-[#15110a] via-[#0c0c0c] to-[#0a0a0a] p-5 flex flex-col sm:flex-row items-center gap-5 overflow-hidden">
      <div className="hidden sm:block relative shrink-0 w-40 h-28 rounded-xl bg-[#0a3d1d] border-2 border-black/60 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #2d5934 0%, #1a3a22 60%, #0a1f11 100%)' }} />
        <div className="absolute inset-3 rounded-[50%] border border-white/10" />
        {room.players.slice(0, 8).map((p, i) => {
          const angle = (i / Math.max(room.players.length, 1)) * Math.PI * 2;
          return (
            <div
              key={p.id}
              className="absolute w-4 h-4 rounded-full overflow-hidden ring-1 ring-black/40 -translate-x-1/2 -translate-y-1/2"
              style={{ left: 50 + 38 * Math.cos(angle) + '%', top: 50 + 38 * Math.sin(angle) + '%' }}
            >
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(p.avatar || p.id)} />
            </div>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider">Самый оживлённый стол</span>
          <h3 className="text-xl font-black text-white">{room.name}</h3>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">{room.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}</span>
        </div>
        <div className="text-2xl font-black text-amber-300 tabular-nums mt-1">{formatMoney(room.smallBlind)} / {formatMoney(room.bigBlind)}</div>
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
          <span>{room.currentPlayers}/{room.maxPlayers} игроков</span>
          <span>{room.buyInMinBb}-{room.buyInMaxBb}BB</span>
        </div>
      </div>

      <div className="flex flex-row sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
        <RoomActionButton room={room} imIn={imIn} myQueuePos={myQueuePos} onJoin={onJoin} onQueue={onQueue} onLeaveQueue={onLeaveQueue} fullWidth />
        {!imIn && (
          <button onClick={onObserve} className="px-5 py-1.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5">
            <Eye size={12} /> {t('lobby.observe')}
          </button>
        )}
      </div>
    </div>
  );
}

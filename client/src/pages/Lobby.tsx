import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Dices, Trophy } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useJoinFlow } from '../hooks/useJoinFlow';
import { useLobbyData } from '../hooks/useLobbyData';
import { useRoomFilters } from '../hooks/useRoomFilters';
import { useClubStore } from '../store/clubStore';
import { RoomCard } from '../components/lobby/RoomCard';
import { CreateRoomModal } from '../components/lobby/CreateRoomModal';
import { PasswordModal } from '../components/lobby/PasswordModal';
import { BuyInModal } from '../components/lobby/BuyInModal';
import { BadBeatBanner } from '../components/lobby/BadBeatBanner';
import { PageBackground } from '../components/layout/PageBackground';
import { loadGameSettings } from '../config/gameSettings';

export const Lobby = () => {
  const { t } = useTranslation();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const myClub = useClubStore((s) => s.myClub);
  const navigate = useNavigate();
  const join = useJoinFlow(myId);
  const { rooms, showCreate, setShowCreate, createRoom } = useLobbyData(join.reset);

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

  useEffect(() => {
    if (!loadGameSettings().soundEnabled) return;
    const audio = new Audio('/sounds/lobby.mp3');
    audio.loop = true;
    audio.volume = 0.25;
    const tryPlay = () => audio.play().catch(() => {});
    audio.play().catch(() => {
      // Автовоспроизведение заблокировано — запускаем при первом жесте
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

  return (
    <>
      <PageBackground />
      <div className="container mx-auto px-4 pt-0 pb-12 relative z-10">
      {/* Баннер Bad Beat Jackpot (виден только когда джекпот включён) — вход на /bad-beat */}
      <BadBeatBanner />
      {/* Шапка: название + счётчики + кнопка «Создать» */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-lg">
              <Users size={12} /> {onlineCount} {t('lobby.online')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-lg">
              <Dices size={12} /> {tableCount} {tableCount === 1 ? t('lobby.tableSingular') : t('lobby.tablePlural')}
            </span>
            <button
              onClick={() => navigate('/leaderboard')}
              title={t('lobby.leaderboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg hover:bg-black/60 transition-colors"
            >
              <Trophy size={12} />
            </button>
          </div>
        </motion.div>
        <div className="flex items-center gap-2">
          <div className="relative w-40 sm:w-56">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('lobby.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800/70 backdrop-blur-md border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
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

      {/* Табы по форматам: NLH + Шорт-дэк (memory game_formats). */}
      <div className="flex flex-wrap items-center gap-1 mb-3 overflow-x-auto">
        {([
          { id: 'all', label: t('lobby.formatAll') },
          { id: 'nlh', label: 'NLH' },
          { id: 'shortdeck', label: t('lobby.formatShortdeck') },
        ] as const).map((tab) => {
          const active = formatTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFormatTab(tab.id)}
              className={
                'px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap backdrop-blur-md ' +
                (active
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-gray-900/55 text-gray-300 hover:bg-white/10 hover:text-white')
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>


      {/* Пресеты фильтра блайндов: До $1 / $1-5 / $5+ (референс «Modern Poker Club») */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {([
          { id: 'all',       label: t('lobby.stakeAll') },
          { id: 'upTo1',     label: t('lobby.stakeUpTo1'),     hint: '≤$1 BB' },
          { id: 'oneToFive', label: t('lobby.stakeOneToFive'), hint: '$1–5 BB' },
          { id: 'fivePlus',  label: t('lobby.stakeFivePlus'),  hint: '>$5 BB' },
        ] as const).map((p) => {
          const active = blindPreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setBlindPreset(p.id)}
              title={'hint' in p ? p.hint : undefined}
              className={
                'px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border backdrop-blur-md ' +
                (active
                  ? 'bg-poker-gold/20 text-poker-gold border-poker-gold/50 shadow shadow-poker-gold/20'
                  : 'bg-gray-900/55 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white')
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Секция клубных комнат — только для членов клуба */}
      {clubRooms.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
              {t('lobby.clubRooms')} · {myClub?.name}
            </span>
            <span className="text-[10px] text-gray-600">{clubRooms.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                imIn={!!myId && room.playerIds.includes(myId)}
                myQueuePos={myId ? room.waitlistIds.indexOf(myId) + 1 : 0}
                onJoin={() => join.handleJoin(room)}
                onQueue={() => join.handleQueue(room)}
                onLeaveQueue={() => join.handleLeaveQueue(room)}
              />
            ))}
          </div>
        </div>
      )}

      {publicRooms.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-gray-500 mt-20"
        >
          <p className="text-6xl mb-4">🃏</p>
          <p>{t('lobby.emptyTitle')}</p>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-gray-500 mt-20"
        >
          <p className="text-4xl mb-4">🔍</p>
          <p>{t('lobby.emptyFiltered')}</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              imIn={!!myId && room.playerIds.includes(myId)}
              myQueuePos={myId ? room.waitlistIds.indexOf(myId) + 1 : 0}
              onJoin={() => join.handleJoin(room)}
              onQueue={() => join.handleQueue(room)}
              onLeaveQueue={() => join.handleLeaveQueue(room)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateRoomModal onClose={() => setShowCreate(false)} onSubmit={createRoom} />
        )}
        {join.pendingJoin?.stage === 'password' && (
          <PasswordModal
            onClose={join.reset}
            onSubmit={join.handlePasswordSubmit}
          />
        )}
        {join.pendingJoin?.stage === 'buyin' && (
          <BuyInModal
            room={join.pendingJoin.room}
            onClose={join.reset}
            onSubmit={join.handleBuyInSubmit}
          />
        )}
      </AnimatePresence>
    </div>
    </>
  );
};

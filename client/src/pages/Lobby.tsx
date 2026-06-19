import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
              <Users size={12} /> {onlineCount} онлайн
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-lg">
              <Dices size={12} /> {tableCount} {tableCount === 1 ? 'стол' : 'столов'}
            </span>
            <button
              onClick={() => navigate('/leaderboard')}
              title="Таблица лидеров"
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
              placeholder="Поиск стола…"
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
            Создать комнату
          </motion.button>
        </div>
      </div>

      {/* Табы по форматам: NLH + Шорт-дэк (memory game_formats). */}
      <div className="flex flex-wrap items-center gap-1 mb-3 overflow-x-auto">
        {([
          { id: 'all', label: 'Все', enabled: true },
          { id: 'nlh', label: 'NLH', enabled: true },
          { id: 'shortdeck', label: 'Шорт-дэк', enabled: true },
        ] as const).map((t) => {
          const active = formatTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => t.enabled && setFormatTab(t.id)}
              disabled={!t.enabled}
              title={!t.enabled ? 'Скоро' : ''}
              className={
                'px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ' +
                (active
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : t.enabled
                  ? 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                  : 'bg-white/5 text-gray-600 cursor-not-allowed')
              }
            >
              {t.label}
              {!t.enabled && <span className="ml-1 text-[10px] opacity-60">скоро</span>}
            </button>
          );
        })}
      </div>


      {/* Пресеты фильтра блайндов: Микро / Низкие / Средние / Высокие */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {([
          { id: 'all',    label: 'Все ставки' },
          { id: 'micro',  label: 'Микро',    hint: '≤0.10 BB' },
          { id: 'low',    label: 'Низкие',   hint: '0.25–1.00 BB' },
          { id: 'medium', label: 'Средние',  hint: '1.25–10.00 BB' },
          { id: 'high',   label: 'Высокие',  hint: '>10 BB' },
        ] as const).map((p) => {
          const active = blindPreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setBlindPreset(p.id)}
              title={'hint' in p ? p.hint : undefined}
              className={
                'px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border ' +
                (active
                  ? 'bg-poker-gold/20 text-poker-gold border-poker-gold/50 shadow shadow-poker-gold/20'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white')
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
              Комнаты клуба · {myClub?.name}
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
                onObserve={() => navigate('/game/' + room.id + '?observe=1')}
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
          <p>Пока нет открытых комнат. Создай первую!</p>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-gray-500 mt-20"
        >
          <p className="text-4xl mb-4">🔍</p>
          <p>Под фильтр ничего не подходит.</p>
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
              onObserve={() => navigate('/game/' + room.id + '?observe=1')}
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

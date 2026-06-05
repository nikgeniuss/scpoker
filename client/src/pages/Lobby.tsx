import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Search, Clock, Dices } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useJoinFlow } from '../hooks/useJoinFlow';
import { useLobbyData } from '../hooks/useLobbyData';
import { useRoomFilters } from '../hooks/useRoomFilters';
import { RoomCard } from '../components/lobby/RoomCard';
import { CreateRoomModal } from '../components/lobby/CreateRoomModal';
import { PasswordModal } from '../components/lobby/PasswordModal';
import { BuyInModal } from '../components/lobby/BuyInModal';

export const Lobby = () => {
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const join = useJoinFlow(myId);
  const { rooms, showCreate, setShowCreate, createRoom } = useLobbyData(join.reset);
  const {
    search, setSearch,
    myOnly, setMyOnly,
    hideUnavailable, setHideUnavailable,
    waitingOnly, setWaitingOnly,
    formatTab, setFormatTab,
    filtered, myRoomsCount, onlineCount, tableCount,
  } = useRoomFilters(rooms, myId);

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Шапка: название + счётчики + кнопка «Создать» */}
      <div className="flex flex-wrap justify-between items-end gap-3 mb-5">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-4xl font-bold text-white">Столы</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              <Users size={12} /> {onlineCount} онлайн
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold">
              <Dices size={12} /> {tableCount} {tableCount === 1 ? 'стол' : 'столов'}
            </span>
          </div>
        </motion.div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 font-bold text-white shadow-lg shadow-emerald-500/30"
        >
          <Plus size={18} />
          Создать комнату
        </motion.button>
      </div>

      {/* Табы по форматам. Сейчас живой только NLH; остальные — disabled stub'ы. */}
      <div className="flex flex-wrap items-center gap-1 mb-3 overflow-x-auto">
        {([
          { id: 'all', label: 'Все', enabled: true },
          { id: 'nlh', label: 'NLH', enabled: true },
          { id: 'shortdeck', label: 'Шорт-дэк', enabled: false },
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

      {/* Toolbar: поиск + фильтры */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или создателю…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={() => setMyOnly((v) => !v)}
          disabled={!myId}
          className={
            'px-3 py-2 rounded-xl text-sm font-bold transition-all border disabled:opacity-40 ' +
            (myOnly
              ? 'bg-emerald-500 border-emerald-400 text-white'
              : 'bg-gray-800 border-white/10 text-gray-300 hover:border-emerald-500/40')
          }
        >
          ⭐ Мои {myRoomsCount > 0 && <span className="opacity-80">({myRoomsCount})</span>}
        </button>
        <button
          onClick={() => setWaitingOnly((v) => !v)}
          className={
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all border ' +
            (waitingOnly
              ? 'bg-emerald-500 border-emerald-400 text-white'
              : 'bg-gray-800 border-white/10 text-gray-300 hover:border-emerald-500/40')
          }
        >
          <Clock size={14} /> Только ожидающие
        </button>
        <button
          onClick={() => setHideUnavailable((v) => !v)}
          className={
            'px-3 py-2 rounded-xl text-sm font-bold transition-all border ' +
            (hideUnavailable
              ? 'bg-emerald-500 border-emerald-400 text-white'
              : 'bg-gray-800 border-white/10 text-gray-300 hover:border-emerald-500/40')
          }
        >
          Скрыть недоступные
        </button>
      </div>

      {rooms.length === 0 ? (
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
              onJoin={() => join.handleJoin(room)}
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
  );
};

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronDown, ArrowDownUp } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { avatarConfig } from '../../utils/avatar';
import { avatarColor } from '../../components/game/seatColors';
import { countryFlag, countryName } from '../../utils/country';
import { PlayerDetailView } from './PlayerDetailView';
import { formatMoney } from '../../config/chipFormat';
import type { AdminUser, RoleFilter, SortBy } from './types';

// Красная фишка-иконка (как метрика-маркер в эталоне списка игроков).
const PokerChip = ({ size = 14 }: { size?: number }) => (
  <span
    className="inline-block rounded-full bg-red-500 border-2 border-dashed border-white/40 shrink-0"
    style={{ width: size, height: size }}
    aria-hidden
  />
);

// Пилюли-фильтр по роли (сегмент-контрол, активная — зелёная).
const ROLE_PILLS: Array<{ id: RoleFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'admin', label: 'Админы' },
  { id: 'player', label: 'Игроки' },
  { id: 'banned', label: 'Забаненные' },
];

export const PlayersTab = () => {
  const { token, user: me } = useAuthStore();
  const api = useAdminApi(token);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('username');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<AdminUser[]>('/admin/users', 'Не удалось загрузить список')
      .then(setUsers)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // Поиск (по username/publicId/email) + фильтр по роли/бану + сортировка
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      if (q) {
        const hay =
          u.username.toLowerCase() +
          ' ' +
          (u.publicId ?? '').toLowerCase() +
          ' ' +
          u.email.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter === 'admin' && u.role !== 'admin') return false;
      if (roleFilter === 'player' && u.role !== 'player') return false;
      if (roleFilter === 'banned' && !u.banned) return false;
      return true;
    });
    const sorted = [...list];
    if (sortBy === 'username') {
      sorted.sort((a, b) => a.username.localeCompare(b.username, 'ru'));
    } else if (sortBy === 'chips') {
      sorted.sort((a, b) => b.chips - a.chips);
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sortBy === 'pnl') {
      sorted.sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
    }
    return sorted;
  }, [users, search, roleFilter, sortBy]);

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  // Открыта карточка деталей конкретного игрока
  const selected = selectedId ? users.find((u) => u.id === selectedId) : undefined;
  if (selectedId && selected) {
    return (
      <PlayerDetailView
        user={selected}
        meId={me?.id}
        api={api}
        onBack={() => setSelectedId(null)}
        onChanged={(u) => setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
        onDeleted={(id) => {
          setUsers((prev) => prev.filter((x) => x.id !== id));
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-10 max-w-3xl mx-auto">
      {/* Поиск */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по нику, ID или email…"
          className="w-full pl-11 pr-3 py-3 rounded-xl bg-gray-800/50 border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {/* Пилюли-фильтр по роли */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-800/70 border border-white/10 overflow-x-auto">
        {ROLE_PILLS.map((p) => (
          <button
            key={p.id}
            onClick={() => setRoleFilter(p.id)}
            className={
              'flex-1 min-h-[36px] px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ' +
              (roleFilter === p.id
                ? 'bg-emerald-500 text-white shadow'
                : 'text-gray-400 hover:text-white hover:bg-white/5')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Сводка + сортировка */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-300">
          Всего игроков{' '}
          <span className="text-emerald-400 font-bold">{filtered.length}</span>
          {filtered.length !== users.length && (
            <span className="text-gray-500"> из {users.length}</span>
          )}
        </div>
        <div className="relative">
          <ArrowDownUp
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="appearance-none pl-9 pr-9 py-2 rounded-xl bg-gray-800/70 border border-white/10 text-white text-sm cursor-pointer focus:border-emerald-500 min-h-[36px]"
          >
            <option value="username">Ник (А→Я)</option>
            <option value="chips">Баланс (↓)</option>
            <option value="created">Дата (новые)</option>
            <option value="pnl">PnL (плюс/минус)</option>
            <option value="rake" disabled>
              Рейк (скоро)
            </option>
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-8">Под фильтр ничего не подходит.</div>
      )}

      {filtered.map((u) => {
        const isMe = me?.id === u.id;
        return (
          <button
            key={u.id}
            onClick={() => setSelectedId(u.id)}
            className={
              'w-full text-left rounded-2xl border overflow-hidden hover:border-white/20 transition-colors ' +
              (u.banned ? 'bg-red-950/30 border-red-700/40' : 'bg-gray-800/70 border-white/10')
            }
          >
            {/* Шапка карточки */}
            <div className="flex items-center gap-3 p-3">
              {/* Аватар-квадрат + флаг */}
              <div className="relative shrink-0">
                <div
                  className="w-12 h-12 rounded-xl overflow-hidden"
                  style={{ background: avatarColor(u.username) }}
                >
                  <ReactNiceAvatar className="w-full h-full" shape="square" {...avatarConfig(u.id)} />
                </div>
                {u.country && (
                  <span
                    title={countryName(u.country)}
                    className="absolute -bottom-1 -right-1 text-sm leading-none drop-shadow"
                  >
                    {countryFlag(u.country) || ''}
                  </span>
                )}
              </div>

              {/* Ник + ID */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold text-[15px] truncate">{u.username}</span>
                  {isMe && <span className="text-xs text-gray-400">(вы)</span>}
                  {u.banned && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-600 text-white">
                      бан
                    </span>
                  )}
                </div>
                {u.publicId && (
                  <div className="text-xs text-gray-400 font-mono mt-0.5">ID : {u.publicId}</div>
                )}
              </div>

              {/* Разделитель + метрика справа (баланс) */}
              <span className="w-px h-8 self-center bg-white/10 shrink-0" />
              <div className="flex items-center gap-2 pl-3 shrink-0">
                <PokerChip />
                <span className="text-gray-200 font-semibold text-base tabular-nums">
                  {formatMoney(u.chips)}
                </span>
              </div>
            </div>

            {/* Нижняя инсет-строка: псевдоним */}
            <div className="px-4 py-2 bg-black/30 border-t border-white/10 text-xs text-gray-500">
              Псевдоним{' '}
              {u.alias ? <span className="text-gray-300">{u.alias}</span> : <span className="text-gray-600">—</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
};

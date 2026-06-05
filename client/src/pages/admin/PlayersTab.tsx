import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { COUNTRIES, countryFlag, countryName } from '../../utils/country';
import type { AdminUser, RoleFilter, SortBy } from './types';

export const PlayersTab = () => {
  const { token, user: me } = useAuthStore();
  const api = useAdminApi(token);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [chipsDraft, setChipsDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('username');

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

  const patchUser = async (
    id: string,
    fields: Partial<Pick<AdminUser, 'chips' | 'role' | 'banned'>> & { country?: string | null },
  ) => {
    try {
      const updated = await api.patch<AdminUser>('/admin/users/' + id, fields);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      toast.success('Сохранено');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
    }
    return sorted;
  }, [users, search, roleFilter, sortBy]);

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-3 pb-10">
      <h2 className="text-2xl font-bold text-white mb-4">
        Игроки ({filtered.length}
        {filtered.length !== users.length && <span className="text-gray-400 font-normal"> из {users.length}</span>})
      </h2>

      {/* Toolbar: поиск + фильтр по роли + сортировка */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по нику, ID или email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="px-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-white text-sm cursor-pointer focus:border-emerald-500"
        >
          <option value="all">Все роли</option>
          <option value="admin">Только админы</option>
          <option value="player">Только игроки</option>
          <option value="banned">Только забаненные</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-white text-sm cursor-pointer focus:border-emerald-500"
        >
          <option value="username">По нику (А→Я)</option>
          <option value="chips">По балансу (↓)</option>
          <option value="created">По дате (новые сверху)</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          Под фильтр ничего не подходит.
        </div>
      )}

      {filtered.map((u) => {
        const isMe = me?.id === u.id;
        const draft = chipsDraft[u.id] ?? '';
        return (
          <div
            key={u.id}
            className={
              'rounded-2xl p-4 border ' +
              (u.banned ? 'bg-red-950/30 border-red-700/40' : 'bg-gray-800 border-white/10')
            }
          >
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {u.country && (
                <span title={countryName(u.country)} className="text-xl leading-none">
                  {countryFlag(u.country) || u.country}
                </span>
              )}
              <div className="text-white font-bold text-lg">{u.username}</div>
              {u.publicId && (
                <span
                  className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/40 text-gray-300 tracking-wider"
                  title="Публичный ID игрока"
                >
                  {u.publicId}
                </span>
              )}
              {isMe && <span className="text-xs text-gray-400">(вы)</span>}
              <span
                className={
                  'text-xs px-2 py-0.5 rounded-full font-bold ' +
                  (u.role === 'admin' ? 'bg-poker-gold text-black' : 'bg-gray-600 text-white')
                }
              >
                {u.role}
              </span>
              {u.banned && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-600 text-white">
                  забанен
                </span>
              )}
              <span className="text-sm text-gray-400 ml-auto">{u.email}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Фишки */}
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-300 mr-1">Фишки: {u.chips} 💰</span>
                <button
                  onClick={() => patchUser(u.id, { chips: Math.max(0, u.chips - 100) })}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold"
                >
                  −100
                </button>
                <button
                  onClick={() => patchUser(u.id, { chips: u.chips + 100 })}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold"
                >
                  +100
                </button>
                <input
                  type="number"
                  min={0}
                  placeholder="точное"
                  value={draft}
                  onChange={(e) => setChipsDraft((p) => ({ ...p, [u.id]: e.target.value }))}
                  className="w-20 px-2 py-1 rounded bg-gray-900 border border-white/10 text-white text-xs"
                />
                <button
                  disabled={draft === ''}
                  onClick={() => {
                    const n = Number(draft);
                    if (!Number.isFinite(n) || n < 0) {
                      toast.error('Неверное число');
                      return;
                    }
                    patchUser(u.id, { chips: n });
                    setChipsDraft((p) => ({ ...p, [u.id]: '' }));
                  }}
                  className="px-2 py-1 rounded bg-poker-gold text-black text-xs font-bold disabled:opacity-30"
                >
                  Установить
                </button>
              </div>

              {/* Роль */}
              <button
                disabled={isMe}
                onClick={() => patchUser(u.id, { role: u.role === 'admin' ? 'player' : 'admin' })}
                className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold disabled:opacity-30"
              >
                {u.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
              </button>

              {/* Бан */}
              <button
                disabled={isMe}
                onClick={() => patchUser(u.id, { banned: !u.banned })}
                className={
                  'px-3 py-1 rounded text-white text-xs font-bold disabled:opacity-30 ' +
                  (u.banned ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600')
                }
              >
                {u.banned ? 'Разбанить' : 'Забанить'}
              </button>

              {/* Страна */}
              <select
                value={u.country ?? ''}
                onChange={(e) => patchUser(u.id, { country: e.target.value === '' ? null : e.target.value })}
                className="px-2 py-1 rounded bg-gray-900 border border-white/10 text-white text-xs cursor-pointer"
                title="Страна игрока (флаг)"
              >
                <option value="">— страна —</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
};

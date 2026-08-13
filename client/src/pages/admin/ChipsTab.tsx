import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { Search, CheckSquare, Square, Plus, Minus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import type { AdminUser, ChipOpEntry } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTs = (ts: number) => {
  const d = new Date(ts);
  return (
    pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
};

export const ChipsTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountStr, setAmountStr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ops, setOps] = useState<ChipOpEntry[]>([]);

  const load = useCallback(() => {
    api
      .get<AdminUser[]>('/admin/users', 'Не удалось загрузить список')
      .then((list) => {
        setUsers(list.filter((u) => !u.banned));
        setSelected(new Set());
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [api]);

  const loadOps = useCallback(() => {
    api
      .get<ChipOpEntry[]>('/admin/chip-ops', 'Не удалось загрузить историю операций')
      .then(setOps)
      .catch((e) => toast.error((e as Error).message));
  }, [api]);

  useEffect(() => { load(); loadOps(); }, [load, loadOps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.publicId ?? '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalChips = useMemo(() => users.reduce((s, u) => s + u.chips, 0), [users]);

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const apply = async (mode: 'add' | 'subtract') => {
    const amount = parseMoney(amountStr);
    if (amount <= 0) { toast.error('Введите сумму'); return; }
    if (selected.size === 0) { toast.error('Выберите хотя бы одного игрока'); return; }
    setBusy(true);
    try {
      const result = await api.post<{ updated: number }>('/admin/users/bulk-chips', {
        userIds: Array.from(selected),
        amount,
        mode,
      }, 'Ошибка при изменении фишек');
      const verb = mode === 'add' ? 'Выдано' : 'Возвращено';
      toast.success(`${verb} ${formatMoney(amount)} × ${result.updated} игрок(ов)`);
      load();
      loadOps();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-4 pb-28 max-w-3xl mx-auto">
      {/* Сводка */}
      <div className="rounded-2xl bg-gray-800/70 border border-white/10 p-4 flex items-center justify-between">
        <span className="text-gray-400 text-sm">Фишки в системе (все игроки)</span>
        <span className="text-emerald-400 font-bold text-lg tabular-nums">{formatMoney(totalChips)}</span>
      </div>

      {/* Поиск */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по нику или ID…"
          className="w-full pl-11 pr-3 py-3 rounded-xl bg-gray-800/50 border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {/* Заголовок списка + выбрать всех */}
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors min-h-[44px]"
        >
          {allSelected
            ? <CheckSquare size={18} className="text-emerald-400" />
            : <Square size={18} className="text-gray-500" />}
          {allSelected ? 'Снять выбор' : 'Выбрать всех'}
        </button>
        <span className="text-sm text-gray-500">
          {filtered.length} игрок{filtered.length !== users.length ? ` из ${users.length}` : ''}
        </span>
      </div>

      {/* Список */}
      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-8">Никого не найдено.</div>
      )}

      {filtered.map((u) => {
        const isSelected = selected.has(u.id);
        return (
          <button
            key={u.id}
            onClick={() => toggleOne(u.id)}
            className={
              'w-full text-left rounded-2xl border overflow-hidden transition-colors flex items-center gap-3 p-3 ' +
              (isSelected
                ? 'bg-emerald-900/30 border-emerald-600/50'
                : 'bg-gray-800/70 border-white/10 hover:border-white/20')
            }
          >
            {/* Чекбокс */}
            <div className="shrink-0">
              {isSelected
                ? <CheckSquare size={20} className="text-emerald-400" />
                : <Square size={20} className="text-gray-500" />}
            </div>

            {/* Ник + publicId */}
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-[15px] truncate">{u.username}</div>
              {u.publicId && (
                <div className="text-xs text-gray-500 font-mono">{u.publicId}</div>
              )}
            </div>

            {/* Баланс */}
            <span className="tabular-nums text-gray-200 font-semibold text-sm shrink-0">
              {formatMoney(u.chips)}
            </span>
          </button>
        );
      })}

      {/* История операций */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-gray-400 px-1 mb-2">История операций</h3>
        {ops.length === 0 ? (
          <div className="text-center text-gray-600 py-6 text-sm">Операций пока не было.</div>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
            {ops.slice(0, 10).map((o, i) => (
              <div key={o.ts + '-' + i} className="flex items-center gap-3 p-3 bg-gray-800/70">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200">
                    {o.mode === 'add' ? 'Выдано' : 'Возвращено'} {formatMoney(o.amount)} × {o.usernames.length} игрок(ов)
                  </div>
                  <div className="text-xs text-gray-500 truncate" title={o.usernames.join(', ')}>
                    {o.usernames.join(', ')}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={'text-sm font-semibold tabular-nums ' + (o.mode === 'add' ? 'text-emerald-400' : 'text-rose-400')}>
                    {o.mode === 'add' ? '+' : '−'}{formatMoney(o.amount)}
                  </div>
                  <div className="text-xs text-gray-500">{o.by} · {fmtTs(o.ts)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky панель действий */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur border-t border-white/10 p-4 md:pl-72">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Счётчик + ввод суммы */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 shrink-0">
              Выбрано: <span className="text-white font-bold">{selected.size}</span>
            </span>
            <input
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="Сумма (напр. 100.00)"
              className="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-white text-sm outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          {/* Кнопки */}
          <div className="flex gap-3">
            <button
              disabled={busy || selected.size === 0}
              onClick={() => apply('add')}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
            >
              <Plus size={16} />
              Выдать
            </button>
            <button
              disabled={busy || selected.size === 0}
              onClick={() => apply('subtract')}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
            >
              <Minus size={16} />
              Вернуть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

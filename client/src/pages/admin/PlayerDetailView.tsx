import { useState, useEffect } from 'react';
import { InfoButton } from '../../components/lobby/createControls';
import { useAdminInfo } from '../../components/admin/useAdminInfo';
import { ChevronLeft, Trash2 } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import toast from 'react-hot-toast';
import type { AdminApi } from '../../hooks/useAdminApi';
import { avatarConfig } from '../../utils/avatar';
import { avatarColor } from '../../components/game/seatColors';
import { COUNTRIES, countryFlag, countryName } from '../../utils/country';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import { HandHistoryModal } from '../../components/game/HandHistoryModal';
import { DEFAULT_DESIGN } from '../../config/design';
import type { AdminUser, PlayerStats } from './types';

// Красная фишка-маркер (как в списке/эталоне).
const PokerChip = ({ size = 16 }: { size?: number }) => (
  <span
    className="inline-block rounded-full bg-red-500 border-2 border-dashed border-white/40 shrink-0"
    style={{ width: size, height: size }}
    aria-hidden
  />
);

// Периоды статистики (как в эталоне: Общий / Прошлые 7 дней / Свой).
type StatPeriod = 'all' | '7d' | 'custom';
const PERIODS: Array<{ id: StatPeriod; label: string }> = [
  { id: 'all', label: 'Общий' },
  { id: '7d', label: 'Прошлые 7 дней' },
  { id: 'custom', label: 'Свой' },
];

interface PlayerDetailViewProps {
  user: AdminUser;
  meId: string | undefined;
  api: AdminApi;
  onBack: () => void;
  onChanged: (updated: AdminUser) => void;
  onDeleted: (id: string) => void;
}

export const PlayerDetailView = ({ user, meId, api, onBack, onChanged, onDeleted }: PlayerDetailViewProps) => {
  const { openInfo, infoSheet } = useAdminInfo();
  const isMe = meId === user.id;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aliasDraft, setAliasDraft] = useState(user.alias ?? '');
  const [noteDraft, setNoteDraft] = useState(user.note ?? '');
  const [chipsDraft, setChipsDraft] = useState('');
  const [period, setPeriod] = useState<StatPeriod>('all');
  const [savingNotes, setSavingNotes] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Загрузка статистики за выбранный период (all / 7d / custom).
  useEffect(() => {
    let path = '/admin/users/' + user.id + '/stats?period=' + period;
    if (period === 'custom') {
      if (!fromDate || !toDate) {
        setStats(null);
        return;
      }
      const fromMs = new Date(fromDate + 'T00:00:00').getTime();
      const toMs = new Date(toDate + 'T23:59:59').getTime();
      path += '&from=' + fromMs + '&to=' + toMs;
    }
    let alive = true;
    api
      .get<PlayerStats>(path)
      .then((s) => alive && setStats(s))
      .catch(() => alive && setStats(null));
    return () => {
      alive = false;
    };
  }, [api, user.id, period, fromDate, toDate]);

  const patch = async (fields: Record<string, unknown>) => {
    try {
      const updated = await api.patch<AdminUser>('/admin/users/' + user.id, fields);
      onChanged(updated);
      return updated;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await patch({ alias: aliasDraft.trim() || null, note: noteDraft.trim() || null });
      toast.success('Сохранено');
    } catch {
      /* ошибка уже показана */
    } finally {
      setSavingNotes(false);
    }
  };

  const setChips = () => {
    const n = parseMoney(chipsDraft);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Неверное число');
      return;
    }
    patch({ chips: n }).then(() => setChipsDraft('')).catch(() => {});
  };

  const disable2fa = async () => {
    if (!window.confirm('Отключить 2FA у игрока «' + user.username + '»?')) return;
    try {
      await api.post('/admin/users/' + user.id + '/2fa/disable');
      toast.success('2FA отключена');
      onChanged({ ...user, twoFactorEnabled: false });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeUser = async () => {
    if (isMe) return;
    if (!window.confirm('Удалить игрока «' + user.username + '»? Действие необратимо.')) return;
    try {
      await api.del('/admin/users/' + user.id);
      toast.success('Игрок удалён');
      onDeleted(user.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const lastLogin = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString('ru')
    : 'никогда';

  return (
    <div className="space-y-5 pb-10 max-w-3xl mx-auto">
      {infoSheet}
      {/* Заголовок */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-white"
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-xl font-bold text-white">Детали игрока</h2>
      </div>

      {/* Шапка профиля */}
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-2xl overflow-hidden" style={{ background: avatarColor(user.username) }}>
            <ReactNiceAvatar className="w-full h-full" shape="square" {...avatarConfig(user.id)} />
          </div>
          {user.country && (
            <span
              title={countryName(user.country)}
              className="absolute -bottom-1 -right-1 text-base leading-none drop-shadow"
            >
              {countryFlag(user.country) || ''}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold text-lg truncate">{user.username}</span>
            {isMe && <span className="text-xs text-gray-400">(вы)</span>}
            {user.banned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-600 text-white">бан</span>
            )}
          </div>
          {user.publicId && <div className="text-xs text-gray-400 font-mono mt-0.5">ID : {user.publicId}</div>}
          <div className="text-xs text-gray-500 mt-1">
            Последний вход <span className="text-gray-300">{lastLogin}</span>
          </div>
        </div>
        <button
          onClick={removeUser}
          disabled={isMe}
          className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-30 shrink-0"
        >
          <Trash2 size={16} /> Удаление
        </button>
      </div>

      {/* Баланс */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-800/70 border border-white/10 w-fit">
        <PokerChip />
        <span className="text-white font-bold text-lg tabular-nums">{formatMoney(user.chips)}</span>
      </div>

      {/* Псевдоним + примечание */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs text-gray-400">Псевдоним</label>
            <InfoButton onClick={openInfo('player.alias')} />
          </div>
          <input
            value={aliasDraft}
            maxLength={40}
            onChange={(e) => setAliasDraft(e.target.value)}
            placeholder="Введите псевдоним"
            className="w-full px-3 py-2.5 rounded-xl bg-gray-800/70 border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs text-gray-400">Примечание</label>
            <InfoButton onClick={openInfo('player.note')} />
          </div>
          <textarea
            value={noteDraft}
            maxLength={500}
            rows={3}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Введите примечание"
            className="w-full px-3 py-2.5 rounded-xl bg-gray-800/70 border border-white/10 text-white text-sm outline-none focus:border-emerald-500 resize-none"
          />
        </div>
        <button
          onClick={saveNotes}
          disabled={savingNotes}
          className="px-5 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {savingNotes ? 'Сохраняем…' : 'Сохранить заметки'}
        </button>
      </div>

      {/* Роль */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-white font-semibold">Роль игрока</label>
          <InfoButton onClick={openInfo('player.role')} />
        </div>
        <select
          value={user.role}
          disabled={isMe}
          onChange={(e) => patch({ role: e.target.value }).catch(() => {})}
          className="px-4 py-2 min-h-[40px] rounded-xl bg-gray-800/70 border border-white/10 text-white text-sm cursor-pointer focus:border-emerald-500 disabled:opacity-40"
        >
          <option value="player">Игрок</option>
          <option value="admin">Админ</option>
        </select>
      </div>

      {/* Статистика игры (периоды) */}
      <div className="rounded-2xl bg-gray-800/70 border border-white/10 p-4 space-y-3">
        <h3 className="text-white font-bold">Статистика игры</h3>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-900/60 border border-white/10">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={
                'flex-1 min-h-[36px] px-3 rounded-lg text-sm font-semibold transition-all ' +
                (period === p.id ? 'bg-emerald-500 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-white/5')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 min-h-[36px] rounded-lg bg-gray-900 border border-white/10 text-white text-sm"
            />
            <span className="text-gray-500 text-sm">—</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 min-h-[36px] rounded-lg bg-gray-900 border border-white/10 text-white text-sm"
            />
          </div>
        )}

        {period === 'custom' && (!fromDate || !toDate) ? (
          <div className="text-xs text-gray-500 py-2">Укажите даты периода.</div>
        ) : (
          <div className="divide-y divide-white/5">
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-gray-400">Рук</span>
              <span className="text-gray-200 tabular-nums">
                {stats ? stats.hands.toLocaleString('ru') : '…'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-gray-400">Рейк</span>
              <span className="text-gray-500 tabular-nums">
                {stats ? formatMoney(stats.rake) : '…'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-gray-400">Прибыль/Убыток</span>
              {stats ? (
                <span
                  className={'tabular-nums font-semibold ' + (stats.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}
                >
                  {stats.pnl >= 0 ? '+' : ''}
                  {formatMoney(stats.pnl)}
                </span>
              ) : (
                <span className="text-gray-500">…</span>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-600">Рейк — комиссия, удержанная с банков этого игрока (per-table настройка стола).</p>
        <button
          onClick={() => setHistoryOpen(true)}
          className="w-full min-h-[40px] rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold"
        >
          История рук игрока
        </button>
      </div>

      <HandHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        myId={user.id}
        chipDisplay="chips"
        cardDeck="classic"
        cardBackStyle={DEFAULT_DESIGN.cardBackStyle}
        fetchPath={'/admin/users/' + user.id + '/hands'}
        title={'История — ' + user.username}
        focusIsSelf={false}
      />

      {/* Управление банкроллом / баном / страной */}
      <div className="rounded-2xl bg-gray-800/70 border border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold">Управление</h3>
          <InfoButton onClick={openInfo('player.chips')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-300 mr-1">Фишки:</span>
          <button
            onClick={() => patch({ chips: Math.max(0, user.chips - 100) }).catch(() => {})}
            className="min-h-[36px] px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold"
          >
            −1
          </button>
          <button
            onClick={() => patch({ chips: user.chips + 100 }).catch(() => {})}
            className="min-h-[36px] px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold"
          >
            +1
          </button>
          <input
            type="number"
            min={0}
            placeholder="сумма"
            value={chipsDraft}
            onChange={(e) => setChipsDraft(e.target.value)}
            className="w-24 min-h-[36px] px-2 rounded-lg bg-gray-900 border border-white/10 text-white text-sm"
          />
          <button
            disabled={chipsDraft === ''}
            onClick={setChips}
            className="min-h-[36px] px-3 rounded-lg bg-poker-gold text-black text-sm font-bold disabled:opacity-30"
          >
            Установить
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={isMe}
            onClick={() => patch({ banned: !user.banned }).catch(() => {})}
            className={
              'min-h-[36px] px-3 rounded-lg text-white text-sm font-bold disabled:opacity-30 ' +
              (user.banned ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600')
            }
          >
            {user.banned ? 'Разбанить' : 'Забанить'}
          </button>
          <select
            value={user.country ?? ''}
            onChange={(e) => patch({ country: e.target.value === '' ? null : e.target.value }).catch(() => {})}
            className="min-h-[36px] px-2 rounded-lg bg-gray-900 border border-white/10 text-white text-sm cursor-pointer"
            title="Страна игрока (флаг)"
          >
            <option value="">— страна —</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{user.email}</span>
        </div>
        {user.twoFactorEnabled && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-gray-400">2FA включена у игрока</span>
            <button
              onClick={disable2fa}
              className="min-h-[36px] px-3 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-bold"
            >
              Отключить 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

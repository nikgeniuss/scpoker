import { useState, useEffect, useCallback } from 'react';
import { InfoButton } from '../../components/lobby/createControls';
import { useAdminInfo } from '../../components/admin/useAdminInfo';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { ROOM_PHASE_LABEL } from './types';
import { formatMoney } from '../../config/chipFormat';
import type { AdminRoom, FrozenTableRecordView } from './types';

export const RoomsTab = () => {
  const { openInfo, infoSheet } = useAdminInfo();
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [frozenEvents, setFrozenEvents] = useState<FrozenTableRecordView[]>([]);
  const [showFrozenLog, setShowFrozenLog] = useState(false);

  const load = useCallback(() => {
    api
      .get<AdminRoom[]>('/admin/rooms', 'Не удалось загрузить комнаты')
      .then(setRooms)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [api]);

  // Polling каждые 3 секунды (комнаты живут в памяти, обновляются часто)
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Журнал watchdog'а зависших столов — реже (это история, не live-состояние); грузим
  // сразу и при раскрытии секции.
  useEffect(() => {
    api
      .get<FrozenTableRecordView[]>('/admin/frozen-tables', 'Не удалось загрузить журнал зависших столов')
      .then(setFrozenEvents)
      .catch(() => {});
  }, [api]);

  const kickPlayer = async (roomId: string, userId: string, username: string) => {
    // Временный кик: на сколько минут закрыть повторный вход за этот стол (0 — без блокировки, не бан).
    const input = window.prompt(
      'Кикнуть ' + username + ' со стола.\nНа сколько минут закрыть повторный вход за этот стол? (0 — без блокировки)',
      '5',
    );
    if (input === null) return; // отмена
    const cooldownMin = Math.max(0, Math.min(1440, Math.floor(Number(input) || 0)));
    try {
      await api.post('/admin/rooms/' + roomId + '/kick/' + userId, { cooldownMin });
      toast.success(username + (cooldownMin > 0 ? ' кикнут на ' + cooldownMin + ' мин' : ' кикнут'));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const forceClose = async (roomId: string, roomName: string) => {
    if (!window.confirm('Закрыть комнату «' + roomName + '»? Все игроки будут выкинуты, банк сгорит.')) return;
    try {
      await api.del('/admin/rooms/' + roomId);
      toast.success('Комната закрыта');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-3 pb-10">
      {infoSheet}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-white">Активные комнаты ({rooms.length})</h2>
        <button
          onClick={load}
          className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold"
        >
          ↻ Обновить
        </button>
        <span className="text-xs text-gray-500">авто-обновление каждые 3 сек</span>
        <InfoButton onClick={openInfo('rooms.close')} />
      </div>

      {/* Журнал watchdog'а зависших столов (ROADMAP) — диагностика, не live-состояние. */}
      <div className="rounded-2xl p-4 bg-gray-800 border border-white/10">
        <button
          onClick={() => setShowFrozenLog((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-white font-bold">
            ⚠️ Зависшие столы — журнал восстановлений ({frozenEvents.length})
          </span>
          <InfoButton onClick={openInfo('rooms.watchdog')} />
          <span className="text-xs text-gray-500 ml-auto">{showFrozenLog ? '▲ свернуть' : '▼ развернуть'}</span>
        </button>
        {showFrozenLog && (
          frozenEvents.length === 0 ? (
            <div className="text-gray-400 text-sm mt-3">Зависаний не было.</div>
          ) : (
            <div className="space-y-1 mt-3">
              {frozenEvents.map((e, i) => (
                <div
                  key={e.t + '-' + e.roomId + '-' + i}
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60 text-sm"
                >
                  <span className="text-gray-400 font-mono text-xs">{new Date(e.t).toLocaleString('ru-RU')}</span>
                  <span className="text-white font-semibold">{e.name}</span>
                  <span className="text-xs text-gray-500 font-mono">{e.roomId.slice(0, 8)}…</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                    {ROOM_PHASE_LABEL[e.phase as keyof typeof ROOM_PHASE_LABEL] ?? e.phase}
                  </span>
                  <span className="text-xs text-orange-300 ml-auto">
                    просрочка {Math.round(e.overdueMs / 1000)}с
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {rooms.length === 0 && (
        <div className="text-gray-400 text-sm">Нет активных комнат.</div>
      )}
      {rooms.map((room) => (
        <div key={room.id} className="rounded-2xl p-4 bg-gray-800 border border-white/10">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="text-white font-bold text-lg">{room.name}</div>
            <span className="text-xs text-gray-500 font-mono">{room.id.slice(0, 8)}…</span>
            <span
              className={
                'text-xs px-2 py-0.5 rounded-full font-bold ' +
                (room.status === 'playing' ? 'bg-emerald-700 text-white' : 'bg-gray-600 text-white')
              }
            >
              {room.status === 'playing' ? ROOM_PHASE_LABEL[room.phase] : 'Ожидание'}
            </span>
            {room.hasPassword && (
              <span className="text-xs text-yellow-400">🔒</span>
            )}
            <span className="text-sm text-gray-400">
              SB/BB: {formatMoney(room.smallBlind)}/{formatMoney(room.bigBlind)}
            </span>
            <span className="text-sm text-gray-400">
              Банк: {formatMoney(room.pot)} 💰
            </span>
            <span className="text-sm text-gray-400">
              {room.players.length}/{room.maxPlayers}
            </span>
            <button
              onClick={() => forceClose(room.id, room.name)}
              className="ml-auto px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-bold"
            >
              Закрыть комнату
            </button>
          </div>

          {room.players.length > 0 ? (
            <div className="space-y-1">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60"
                >
                  <span className="text-white text-sm font-semibold">{p.username}</span>
                  <span className="text-xs text-gray-400">{formatMoney(p.chips)} 💰</span>
                  {p.isFolded && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-bold">
                      FOLD
                    </span>
                  )}
                  {p.disconnected && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/60 text-orange-300 font-bold">
                      🔌 откл.
                    </span>
                  )}
                  <button
                    onClick={() => kickPlayer(room.id, p.id, p.username)}
                    className="ml-auto px-2 py-0.5 rounded bg-red-800 hover:bg-red-700 text-white text-xs font-bold"
                  >
                    Кикнуть
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">Игроков нет</div>
          )}
        </div>
      ))}
    </div>
  );
};

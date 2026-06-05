import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { TARGET_LABEL, TARGET_COLOR } from './types';
import type { BotMetaView } from './types';

export const BotsTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [bots, setBots] = useState<BotMetaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refillAmount, setRefillAmount] = useState<number>(100000);
  const [refilling, setRefilling] = useState(false);

  const load = useCallback(() => {
    api
      .get<BotMetaView[]>('/admin/bots')
      .then(setBots)
      .catch(() => toast.error('Не удалось загрузить ботов'))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // обновляем каждые 5 сек для live-метрик
    return () => clearInterval(t);
  }, [load]);

  const updateTarget = async (botId: string, target: 'zero' | 'plus' | 'minus') => {
    try {
      await api.patch('/admin/bots/' + encodeURIComponent(botId), { targetPnL: target });
      // Оптимистичный update
      setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, targetPnL: target } : b)));
      toast.success('Цель обновлена');
    } catch {
      toast.error('Не удалось обновить');
    }
  };

  const refillAll = async () => {
    if (refilling) return;
    setRefilling(true);
    try {
      const data = await api.post<{ refilled: number; chips: number }>('/admin/bots/refill', { chips: refillAmount });
      toast.success(`Пополнено: ${data.refilled} ботов по ${data.chips}`);
      load();
    } catch {
      toast.error('Не удалось пополнить');
    } finally {
      setRefilling(false);
    }
  };

  const refillOne = async (botId: string) => {
    try {
      await api.patch('/admin/bots/' + encodeURIComponent(botId), { chips: refillAmount });
      toast.success(`Бот пополнен до ${refillAmount}`);
      load();
    } catch {
      toast.error('Не удалось пополнить');
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Боты</h2>
        <p className="text-sm text-gray-500">
          {bots.length} ботов в пуле. Метрики обновляются каждые 5 сек. Включить/выключить
          бот-режим — во вкладке «Настройки».
        </p>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-white text-sm font-bold mb-1">Сумма пополнения</label>
          <input
            type="number"
            min={0}
            max={10000000}
            step={1000}
            value={refillAmount}
            onChange={(e) => setRefillAmount(Math.max(0, Math.min(10000000, Math.round(Number(e.target.value) || 0))))}
            className="w-32 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
          />
        </div>
        <button
          onClick={refillAll}
          disabled={refilling}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-50"
        >
          {refilling ? 'Пополняем…' : `Пополнить всем по ${refillAmount.toLocaleString('ru')}`}
        </button>
        <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Сбрасывает PnL/handsPlayed всех ботов. Сумма применяется и кнопкой «↻» у каждого бота.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {bots.map((b) => (
          <div
            key={b.id}
            className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-base">{b.username}</div>
                <div className="text-xs text-gray-500">{b.id}</div>
              </div>
              <span
                className={
                  'px-2 py-0.5 rounded-full text-[10px] font-bold text-white ' +
                  TARGET_COLOR[b.targetPnL]
                }
              >
                {TARGET_LABEL[b.targetPnL]}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-500 flex items-center gap-1">
                  Банкролл
                  <button
                    onClick={() => refillOne(b.id)}
                    title={`Пополнить до ${refillAmount.toLocaleString('ru')}`}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 leading-none"
                  >
                    ↻
                  </button>
                </div>
                <div className="text-white font-bold">{b.chips.toLocaleString('ru')}</div>
              </div>
              <div>
                <div className="text-gray-500">PnL</div>
                <div className={'font-bold ' + (b.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {b.realizedPnL >= 0 ? '+' : ''}
                  {b.realizedPnL.toLocaleString('ru')}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Раздач</div>
                <div className="text-white font-bold">{b.handsPlayed}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-400">
              <div>aggr: {b.persona.aggression.toFixed(2)}</div>
              <div>bluff: {b.persona.bluffRate.toFixed(2)}</div>
              <div>vpip: {b.persona.vpip.toFixed(2)}</div>
            </div>

            <div className="text-[11px] text-gray-500">
              За окно 50 рук: блефов {b.bluffCountLast50}, поймал блефов {b.bluffCallCountLast50}.
              Стол:{' '}
              {b.roomId ? (
                <span className="text-emerald-400 font-mono">{b.roomId}</span>
              ) : (
                <span className="text-gray-600">не за столом</span>
              )}
            </div>

            <div className="flex gap-1.5 pt-1">
              {(['zero', 'plus', 'minus'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateTarget(b.id, t)}
                  className={
                    'flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ' +
                    (b.targetPnL === t
                      ? TARGET_COLOR[t] + ' text-white shadow'
                      : 'bg-gray-900 text-gray-400 hover:bg-gray-700')
                  }
                >
                  {TARGET_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {bots.length === 0 && (
        <div className="text-gray-500 italic">Пул ботов пуст (нет server/data/bots.json).</div>
      )}
    </div>
  );
};

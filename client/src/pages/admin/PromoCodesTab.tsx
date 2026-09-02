import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import type { PromoCode } from '@poker-room/shared';

// Промокоды на бесплатный вход в турниры (§10.x) — раздача не привязана к конкретному турниру:
// код валиден по совпадению buyIn для ЛЮБОГО турнира (напр. подарки в Telegram-группе). Тумблер
// в CreateTournamentModal — ярлык «создать код под ЭТОТ турнир»; здесь — тот же реестр, но вручную.
export const PromoCodesTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyIn, setBuyIn] = useState(500);
  const [maxRedemptions, setMaxRedemptions] = useState(10);

  const load = useCallback(() => {
    api
      .get<PromoCode[]>('/admin/promo-codes', 'Не удалось загрузить промокоды')
      .then(setCodes)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createCode = async () => {
    try {
      await api.post('/admin/promo-codes', { buyIn, maxRedemptions });
      toast.success('Промокод создан');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deactivate = async (code: string) => {
    if (!window.confirm('Деактивировать код «' + code + '»? Дальше он не будет погашаться.')) return;
    try {
      await api.post('/admin/promo-codes/' + code + '/deactivate');
      toast.success('Код деактивирован');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => toast.success('Скопировано'));
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-3 pb-10">
      <h2 className="text-2xl font-bold text-white mb-4">Промокоды на бесплатный вход</h2>

      <div className="rounded-2xl p-4 bg-gray-800 border border-white/10">
        <div className="text-white font-bold mb-3">Создать новый код</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Номинал (бай-ин турниров, где сработает)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={buyIn / 100}
              onChange={(e) => setBuyIn(parseMoney(e.target.value))}
              className="w-32 bg-gray-900 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Лимит активаций</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1))))}
              className="w-24 bg-gray-900 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </label>
          <button
            onClick={createCode}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-white text-sm"
          >
            Создать
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Код сработает на ЛЮБОМ турнире с точно таким же бай-ином — сейчас идущем или будущем.
        </p>
      </div>

      {codes.length === 0 ? (
        <div className="text-gray-400 text-sm">Кодов ещё нет.</div>
      ) : (
        codes.map((c) => (
          <div key={c.code} className="rounded-2xl p-4 bg-gray-800 border border-white/10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => copyCode(c.code)}
              className="font-mono text-sm text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2 py-1 hover:bg-sky-500/20"
              title="Скопировать"
            >
              {c.code}
            </button>
            <span className="text-sm text-gray-400">
              Номинал: <span className="text-white font-bold">{formatMoney(c.buyIn)}</span>
            </span>
            <span className="text-sm text-gray-400">
              Погашено: <span className="text-white font-bold">{c.redeemedBy.length}/{c.maxRedemptions}</span>
            </span>
            <span
              className={
                'text-xs px-2 py-0.5 rounded-full font-bold ' +
                (c.active ? 'bg-emerald-700 text-white' : 'bg-gray-600 text-white')
              }
            >
              {c.active ? 'Активен' : 'Деактивирован'}
            </span>
            <span className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleString('ru-RU')}</span>
            {c.active && (
              <button
                onClick={() => deactivate(c.code)}
                className="ml-auto px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-bold"
              >
                Деактивировать
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

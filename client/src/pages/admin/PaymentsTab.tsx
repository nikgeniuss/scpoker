import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney } from '../../config/chipFormat';
import type { GameSettings, PaymentChain, WithdrawalRequestView, HotWalletBalanceView } from './types';
import { CHAIN_LABEL } from './types';

const CHAINS: PaymentChain[] = ['tron', 'ethereum', 'bsc'];

const STATUS_LABEL: Record<WithdrawalRequestView['status'], string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрено',
  sending: 'Отправляется',
  paid: 'Выплачено',
  rejected: 'Отклонено',
  failed: 'Не удалось',
};

// Вкладка «Платежи» (ROADMAP §11.1) — конфиг депозит/вывод по сетям, очередь выводов
// с approve (запускает авто-отправку через бота) / reject, баланс хот-кошельков для мониторинга.
export const PaymentsTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [queue, setQueue] = useState<WithdrawalRequestView[]>([]);
  const [hotWallets, setHotWallets] = useState<Record<PaymentChain, HotWalletBalanceView | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api.get<GameSettings>('/admin/settings'),
      api.get<WithdrawalRequestView[]>('/admin/payments/queue?status=pending'),
      api.get<Record<PaymentChain, HotWalletBalanceView | null>>('/admin/payments/hot-wallets'),
    ])
      .then(([s, q, hw]) => {
        setSettings(s);
        setQueue(q);
        setHotWallets(hw);
      })
      .catch(() => toast.error('Не удалось загрузить данные платежей'))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.put<GameSettings>('/admin/settings', { payments: settings.payments });
      setSettings(updated);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<GameSettings['payments']>) =>
    setSettings((prev) => (prev ? { ...prev, payments: { ...prev.payments, ...patch } } : prev));

  const updateChain = (chain: PaymentChain, patch: Partial<GameSettings['payments']['chains'][PaymentChain]>) =>
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            payments: {
              ...prev.payments,
              chains: { ...prev.payments.chains, [chain]: { ...prev.payments.chains[chain], ...patch } },
            },
          }
        : prev,
    );

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/admin/payments/${id}/approve`);
      toast.success('Заявка одобрена, бот отправляет выплату');
      setQueue((q) => q.filter((w) => w.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/admin/payments/${id}/reject`, { reason: 'Отклонено администратором' });
      toast.success('Заявка отклонена, фишки возвращены игроку');
      setQueue((q) => q.filter((w) => w.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;
  if (!settings) return null;
  const p = settings.payments;

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-4">Платежи (USDT)</h2>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить депозиты и выводы</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-white text-sm font-bold mb-1">Курс (центов за 1 USDT)</label>
            <input
              type="number"
              min={1}
              value={p.exchangeRateCentsPerUsdt}
              onChange={(e) => update({ exchangeRateCentsPerUsdt: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
            />
          </div>
          <div />
          <div>
            <label className="block text-white text-sm font-bold mb-1">Мин. депозит (USDT)</label>
            <input
              type="number"
              min={0}
              value={p.minDepositUsdt}
              onChange={(e) => update({ minDepositUsdt: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
            />
          </div>
          <div>
            <label className="block text-white text-sm font-bold mb-1">Макс. депозит (USDT)</label>
            <input
              type="number"
              min={0}
              value={p.maxDepositUsdt}
              onChange={(e) => update({ maxDepositUsdt: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
            />
          </div>
          <div>
            <label className="block text-white text-sm font-bold mb-1">Мин. вывод (USDT)</label>
            <input
              type="number"
              min={0}
              value={p.minWithdrawalUsdt}
              onChange={(e) => update({ minWithdrawalUsdt: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
            />
          </div>
          <div>
            <label className="block text-white text-sm font-bold mb-1">Макс. вывод (USDT)</label>
            <input
              type="number"
              min={0}
              value={p.maxWithdrawalUsdt}
              onChange={(e) => update({ maxWithdrawalUsdt: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-white font-bold text-sm">Сети</div>
          {CHAINS.map((chain) => {
            const cs = p.chains[chain];
            const hw = hotWallets?.[chain];
            return (
              <div key={chain} className="flex items-center gap-4 bg-gray-900 rounded-xl px-4 py-3 border border-white/10">
                <label className="flex items-center gap-2 cursor-pointer w-48 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={cs.enabled}
                    onChange={(e) => updateChain(chain, { enabled: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4"
                  />
                  <span className="text-white text-sm">{CHAIN_LABEL[chain]}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Подтверждений:</span>
                  <input
                    type="number"
                    min={1}
                    value={cs.minConfirmations}
                    onChange={(e) => updateChain(chain, { minConfirmations: Number(e.target.value) || 1 })}
                    className="w-16 px-2 py-1 rounded bg-gray-800 border border-white/10 text-white text-sm outline-none focus:border-poker-gold"
                  />
                </div>
                <div className="flex-1 text-right text-xs text-gray-500 truncate">
                  {hw ? `Хот-кошелёк: ${hw.usdt} USDT` : 'Хот-кошелёк не сконфигурирован'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить настройки'}
      </motion.button>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
        <h3 className="text-white font-bold text-lg">Очередь выводов ({queue.length})</h3>
        {queue.length === 0 ? (
          <div className="text-gray-500 text-sm">Заявок на рассмотрении нет</div>
        ) : (
          <div className="space-y-2">
            {queue.map((w) => (
              <div key={w.id} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-white/10">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-bold">{w.username} · {formatMoney(w.amountChips)} 💰</div>
                  <div className="text-xs text-gray-500 truncate">{CHAIN_LABEL[w.chain]} → {w.payoutAddress}</div>
                  <div className="text-xs text-gray-600">{STATUS_LABEL[w.status]}</div>
                </div>
                <button
                  disabled={busyId === w.id}
                  onClick={() => approve(w.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  Одобрить
                </button>
                <button
                  disabled={busyId === w.id}
                  onClick={() => reject(w.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

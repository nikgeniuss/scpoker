import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import type { GameSettings, PaidFeaturesSettings } from './types';

// Вкладка «Платные фичи» (ROADMAP §10.12) — настройка платных фич за столом. Сейчас одна:
// Rabbit Hunting (за плату увидеть карты, которые пришли бы, если рука кончилась раньше ривера).
// Читает/пишет тот же /admin/settings, что и SettingsTab (paidFeatures — отдельный блок).
export const PaidFeaturesTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amountDraft, setAmountDraft] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<GameSettings>('/admin/settings')
      .then(setSettings)
      .catch(() => toast.error('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.put<GameSettings>('/admin/settings', { paidFeatures: settings.paidFeatures });
      setSettings(updated);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка…</div>;
  if (!settings) return null;

  const rh = settings.paidFeatures.rabbitHunt;
  const update = (next: Partial<PaidFeaturesSettings['rabbitHunt']>) =>
    setSettings((prev) =>
      prev ? { ...prev, paidFeatures: { ...prev.paidFeatures, rabbitHunt: { ...prev.paidFeatures.rabbitHunt, ...next } } } : prev,
    );

  return (
    <div className="space-y-6 pb-10 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-4">Платные фичи</h2>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <h3 className="text-white font-bold text-lg mb-1">🐇 Rabbit Hunting</h3>
          <p className="text-sm text-gray-500">
            Если раздача закончилась раньше ривера (все сфолдили), игрок за столом может за плату
            увидеть карты, которые пришли бы. Платит тот, кто запрашивает; оплата учитывается как
            рейк (видна в «Данные»). Окно действия — пока экран шоудауна открыт (5 сек).
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rh.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить Rabbit Hunting</span>
        </label>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-900 border border-white/10 max-w-xs">
          {(['fixed', 'percent'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={!rh.enabled}
              onClick={() => update({ mode: m })}
              className={
                'py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ' +
                (rh.mode === m ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {m === 'fixed' ? 'Фикс. сумма' : 'Процент от банка'}
            </button>
          ))}
        </div>

        {rh.mode === 'fixed' ? (
          <div>
            <label className="block text-white text-sm font-bold mb-1">Цена раскрытия</label>
            <p className="text-xs text-gray-500 mb-2">Списывается со стека игрока за один запрос.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.01}
                disabled={!rh.enabled}
                value={amountDraft ?? String(rh.fixedAmount / 100)}
                onChange={(e) => {
                  setAmountDraft(e.target.value);
                  if (e.target.value === '') return;
                  update({ fixedAmount: parseMoney(e.target.value) });
                }}
                onBlur={() => setAmountDraft(null)}
                className="w-32 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
              />
              <span className="text-gray-400 text-sm">💰 ({formatMoney(rh.fixedAmount)})</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-white text-sm font-bold mb-1">Процент от банка раздачи</label>
            <p className="text-xs text-gray-500 mb-2">Минимум 1 фишка, если процент даёт 0 при маленьком банке.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                disabled={!rh.enabled}
                value={rh.percent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  update({ percent: Math.max(0, Math.min(100, v)) });
                }}
                className="w-28 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
              />
              <span className="text-gray-400 text-sm">%</span>
            </div>
          </div>
        )}
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
    </div>
  );
};

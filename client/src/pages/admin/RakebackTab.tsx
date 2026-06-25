import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useRakebackStore } from '../../store/rakebackStore';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import { TIER_DEFAULTS } from '../../config/rakeback';
import type { RakebackTier } from '../../config/rakeback';

// Вкладка «Рейкбэк» — VIP-кэшбэк % от уплаченного рейка по накопительным уровням (ROADMAP «Рейкбэк»).
// Уровень определяется lifetime-рейком игрока (не сбрасывается). Читает/пишет /admin/rakeback.
export const RakebackTab = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useRakebackStore((s) => s.loadAdmin);
  const saveConfig = useRakebackStore((s) => s.saveConfig);
  const loaded = useRakebackStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [tiers, setTiers] = useState<RakebackTier[]>(TIER_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  useEffect(() => {
    if (seeded.current || !loaded) return;
    seeded.current = true;
    const s = useRakebackStore.getState();
    setEnabled(s.enabled);
    if (s.tiers.length) setTiers(s.tiers);
  }, [loaded]);

  const editTier = (i: number, field: keyof RakebackTier, value: string) => {
    setTiers((ts) =>
      ts.map((t, j) => {
        if (j !== i) return t;
        if (field === 'name') return { ...t, name: value };
        if (field === 'percent') {
          const n = Number(value);
          return { ...t, percent: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : t.percent };
        }
        // minRakeCents — ввод в долларах через parseMoney
        return { ...t, minRakeCents: value === '' ? 0 : parseMoney(value) };
      }),
    );
  };

  const addTier = () => {
    setTiers((ts) => [...ts, { name: 'Новый уровень', minRakeCents: 0, percent: 0 }]);
  };

  const removeTier = (i: number) => {
    setTiers((ts) => ts.filter((_, j) => j !== i));
  };

  const resetDefaults = () => {
    setEnabled(false);
    setTiers(TIER_DEFAULTS);
  };

  const save = async () => {
    if (!tiers.length) {
      toast.error('Нужен хотя бы один уровень');
      return;
    }
    setSaving(true);
    await saveConfig(token, { enabled, tiers });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-6 pb-10 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-4">💸 Рейкбэк</h2>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <h3 className="text-white font-bold text-lg mb-1">VIP-кэшбэк по уровням</h3>
          <p className="text-sm text-gray-500">
            Игрок копит lifetime-рейк (накопительно, без сброса) и автоматически переходит на уровень
            выше при достижении порога. С каждой раздачи % от уплаченного рейка тут же начисляется на
            стек игрока за столом.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить рейкбэк</span>
        </label>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold">Уровни</h3>
          <button
            type="button"
            onClick={addTier}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Уровень
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_1fr_0.7fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs">
            <span>Название</span>
            <span>Порог рейка ($)</span>
            <span>Кэшбэк (%)</span>
            <span />
          </div>
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_0.7fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center">
              <input
                type="text"
                value={t.name}
                onChange={(e) => editTier(i, 'name', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={t.minRakeCents / 100}
                onChange={(e) => editTier(i, 'minRakeCents', e.target.value)}
                title={formatMoney(t.minRakeCents)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={t.percent}
                onChange={(e) => editTier(i, 'percent', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <button
                type="button"
                onClick={() => removeTier(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить уровень"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={resetDefaults} className="mt-3 text-xs text-gray-500 hover:text-white">
          Сбросить к дефолтным уровням
        </button>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить настройки'}
      </button>
    </div>
  );
};

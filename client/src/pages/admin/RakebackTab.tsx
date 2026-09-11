import { useState, useEffect, useRef } from 'react';
import { InfoButton } from '../../components/lobby/createControls';
import { useAdminInfo } from '../../components/admin/useAdminInfo';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useRakebackStore } from '../../store/rakebackStore';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import { TIER_DEFAULTS } from '../../config/rakeback';
import type { RakebackTier } from '../../config/rakeback';

// Вкладка «Рейкбэк» — VIP-кэшбэк % от уплаченного рейка по уровням (ROADMAP §10.20).
// Уровень определяется рейком за скользящее окно последних N дней и потому умеет понижаться.
// Читает/пишет /admin/rakeback.
export const RakebackTab = () => {
  const { openInfo, infoSheet } = useAdminInfo();
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useRakebackStore((s) => s.loadAdmin);
  const saveConfig = useRakebackStore((s) => s.saveConfig);
  const loaded = useRakebackStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
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
    setWindowDays(s.windowDays);
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
    await saveConfig(token, { enabled, tiers, windowDays });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-6 pb-10 max-w-2xl">
      {infoSheet}
      <h2 className="text-2xl font-bold text-white mb-4">💸 Рейкбэк</h2>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">VIP-кэшбэк по уровням</h3>
            <InfoButton onClick={openInfo('rakeback.enabled')} />
          </div>
          <p className="text-sm text-gray-500">
            Уровень игрока считается по рейку за <b>скользящее окно</b> последних N дней и
            пересчитывается каждый день: играет стабильно — уровень держится, сбавил — счёт
            съезжает вниз понемногу (каждый день из окна выпадает рейк того дня, что был N дней
            назад), бросил — за окно доходит до нижнего уровня. Разово поднять статус рывком и
            дальше бездействовать на высоком проценте нельзя. С каждой раздачи % от уплаченного
            рейка начисляется игроку HUB-коинами.
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

        <div>
          <div className="flex items-center gap-2 mb-1">
              <label className="block text-white text-sm font-bold">Окно расчёта уровня (дней)</label>
              <InfoButton onClick={openInfo('rakeback.window')} />
            </div>
          <p className="text-xs text-gray-500 mb-2">
            1–365. Чем короче окно, тем быстрее падает уровень при паузе в игре. 30 дней — как
            месячные уровни у partypoker/888, только без обрыва на границе месяца.
          </p>
          <input
            type="number"
            min={1}
            max={365}
            value={windowDays}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setWindowDays(Math.max(1, Math.min(365, Math.round(v))));
            }}
            className="w-28 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold tabular-nums"
          />
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-bold">Уровни</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Порог — рейк за окно ({windowDays} дн.), а не за всё время.
            </p>
          </div>
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
            <span className="flex items-center gap-1.5">Порог рейка за окно ($)<InfoButton onClick={openInfo('rakeback.tierThreshold')} /></span>
            <span className="flex items-center gap-1.5">Кэшбэк (%)<InfoButton onClick={openInfo('rakeback.tierPercent')} /></span>
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

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useStreakStore } from '../../store/streakStore';
import { STREAK_REWARD_DEFAULTS } from '../../config/streak';
import type { StreakReward } from '../../config/streak';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Визит-бонус (стрик)» вкладки «🎁 Награды» (ROADMAP §10.21.2). Вынесена из
// RewardsTab.tsx отдельным компонентом — вкладка растёт секциями (гонки/рефералка/магазин), см. §0.11.

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Визит-бонус (стрик)',
    lines: [
      'Начисляет HUB-коины за календарные дни подряд со входом в приложение.',
      'Пропуск ≥1 дня сбрасывает серию на 1-й день. Повторный вход в тот же день ничего не добавляет.',
      'Награда идёт в отдельный кошелёк HUB-коинов — НЕ в реальный баланс, вывести в USDT нельзя.',
    ],
  },
  table: {
    title: 'Таблица наград по дням',
    lines: [
      'День 1 — награда за первый вход новой серии, дальше по возрастанию дней.',
      'Если серия дойдёт до дня больше последней строки таблицы — награды повторяются по кругу (день после последнего = снова 1-я строка).',
      'Суммы — в HUB-коинах, не в реальных деньгах.',
    ],
  },
  antiFarm: {
    title: 'Защита от мультиаккаунтов',
    lines: [
      'Награда за 1-й день серии не начисляется, если с этого же IP-адреса или устройства (device-id) недавно уже получал такую награду другой аккаунт.',
      'Свою же серию после паузы это не блокирует — сравнение идёт только с ЧУЖИМИ аккаунтами.',
      'Device-id — тот же идентификатор, что уже используется для защиты столов от мультиаккаунтинга (не настоящий fingerprint, просто UUID в localStorage — очищается вручную).',
    ],
  },
};

export const StreakRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useStreakStore((s) => s.loadAdmin);
  const saveConfig = useStreakStore((s) => s.saveConfig);
  const loaded = useStreakStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [rewards, setRewards] = useState<StreakReward[]>(STREAK_REWARD_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (k: string) => () => setInfoKey(k);
  const seeded = useRef(false);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  useEffect(() => {
    if (seeded.current || !loaded) return;
    seeded.current = true;
    const s = useStreakStore.getState();
    setEnabled(s.enabled);
    if (s.rewards.length) setRewards(s.rewards);
  }, [loaded]);

  const editReward = (i: number, field: keyof StreakReward, value: string) => {
    setRewards((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const n = Number(value);
        if (!Number.isFinite(n)) return r;
        return field === 'day' ? { ...r, day: Math.max(1, Math.round(n)) } : { ...r, amount: Math.max(0, Math.round(n)) };
      }),
    );
  };

  const addReward = () => setRewards((rs) => [...rs, { day: rs.length + 1, amount: 0 }]);
  const removeReward = (i: number) => setRewards((rs) => rs.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setRewards(STREAK_REWARD_DEFAULTS);
  };

  const save = async () => {
    if (!rewards.length) {
      toast.error('Нужен хотя бы один день с наградой');
      return;
    }
    setSaving(true);
    await saveConfig(token, { enabled, rewards });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Визит-бонус (стрик)</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            HUB-коины за календарные дни подряд со входом. Начисляется автоматически при логине,
            без действий игрока.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить визит-бонус</span>
        </label>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <InfoButton onClick={openInfo('antiFarm')} />
          <span>Защита от мультиаккаунтов на 1-й день серии</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Награды по дням</h3>
            <InfoButton onClick={openInfo('table')} />
          </div>
          <button
            type="button"
            onClick={addReward}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> День
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs">
            <span>День серии</span>
            <span>Награда (HUB)</span>
            <span />
          </div>
          {rewards.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center">
              <input
                type="number"
                min={1}
                value={r.day}
                onChange={(e) => editReward(i, 'day', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <input
                type="number"
                min={0}
                value={r.amount}
                onChange={(e) => editReward(i, 'amount', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <button
                type="button"
                onClick={() => removeReward(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить день"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={resetDefaults} className="mt-3 text-xs text-gray-500 hover:text-white">
          Сбросить к дефолтным наградам
        </button>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить визит-бонус'}
      </button>

      <AnimatePresence>
        {infoKey && INFO[infoKey] && (
          <InfoSheet title={INFO[infoKey].title} onClose={() => setInfoKey(null)}>
            {INFO[infoKey].lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </InfoSheet>
        )}
      </AnimatePresence>
    </div>
  );
};

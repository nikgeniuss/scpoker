import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAchievementsStore, type AchievementDef, type AchievementCondition } from '../../store/achievementsStore';
import { useChestsStore } from '../../store/chestsStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Достижения» вкладки «🎁 Награды» (ROADMAP §10.21.3). Прогресс считается на лету
// сервером (compute-on-read) — здесь редактируется только каталог: условие+порог+награда.

const CONDITIONS: { value: AchievementCondition; label: string }[] = [
  { value: 'hands', label: 'Рук сыграно' },
  { value: 'tournamentsPlayed', label: 'Турниров сыграно' },
  { value: 'tournamentWins', label: 'Побед в турнирах' },
  { value: 'lifetimeRake', label: 'Рейк (центы, реальные $)' },
];

const DEFAULT_CATALOG: AchievementDef[] = [
  { id: 'first-hand', title: 'Первая раздача', condition: 'hands', threshold: 1, rewardAmount: 5 },
  { id: '100-hands', title: '100 рук', condition: 'hands', threshold: 100, rewardAmount: 20 },
  { id: 'tournament-win', title: 'Победа в турнире', condition: 'tournamentWins', threshold: 1, rewardAmount: 30 },
  { id: '1000-hands', title: '1000 рук', condition: 'hands', threshold: 1000, rewardAmount: 50 },
  { id: 'vip-platinum', title: 'VIP Platinum', condition: 'lifetimeRake', threshold: 50_000, rewardAmount: 100 },
  { id: '10-tournaments', title: '10 турниров', condition: 'tournamentsPlayed', threshold: 10, rewardAmount: 40 },
];

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Достижения',
    lines: [
      'Одноразовые вехи (не повторяются) — игрок сам забирает награду тапом на странице «Награды», когда условие выполнено.',
      'Прогресс считается на лету по уже существующим данным (руки/PnL, турниры, рейк) — отдельного трекинга не требует.',
      'Награда — HUB-коины, не реальные деньги.',
    ],
  },
  condition: {
    title: 'Условие достижения',
    lines: [
      '«Рук сыграно» / «Турниров сыграно» / «Побед в турнирах» — считаются lifetime, без сброса.',
      '«Рейк» — реальный lifetime-рейк игрока в центах (та же величина, что определяет тир рейкбэка) — удобно завязать ачивку на VIP-уровень, задав порог равным порогу тира.',
      'Турниры считаются уникальными — повторный вход (ре-энтри) в тот же турнир не увеличивает счётчик «сыграно».',
    ],
  },
};

function newId(): string {
  return 'ach-' + Math.random().toString(36).slice(2, 8);
}

export const AchievementsRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useAchievementsStore((s) => s.loadAdmin);
  const saveConfig = useAchievementsStore((s) => s.saveConfig);
  const loaded = useAchievementsStore((s) => s.loaded);
  // Каталог сундуков — чтобы вместо фиксированной награды можно было выбрать случайную (§10.21.7).
  const chests = useChestsStore((s) => s.catalog);
  const loadChests = useChestsStore((s) => s.loadAdmin);

  const [enabled, setEnabled] = useState(false);
  const [catalog, setCatalog] = useState<AchievementDef[]>(DEFAULT_CATALOG);
  const [saving, setSaving] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (k: string) => () => setInfoKey(k);
  const seeded = useRef(false);

  useEffect(() => {
    loadAdmin(token);
    loadChests(token);
  }, [loadAdmin, loadChests, token]);

  useEffect(() => {
    if (seeded.current || !loaded) return;
    seeded.current = true;
    const s = useAchievementsStore.getState();
    setEnabled(s.enabled);
    if (s.catalog.length) setCatalog(s.catalog);
  }, [loaded]);

  const editDef = (i: number, field: keyof AchievementDef, value: string) => {
    setCatalog((cs) =>
      cs.map((c, j) => {
        if (j !== i) return c;
        if (field === 'title') return { ...c, title: value };
        // Пустое значение = фиксированная награда: поле не храним вовсе, чтобы не плодить '' в файле.
        if (field === 'chestId') return value ? { ...c, chestId: value } : { ...c, chestId: undefined };
        if (field === 'condition') return { ...c, condition: value as AchievementCondition };
        const n = Number(value);
        if (!Number.isFinite(n)) return c;
        return field === 'threshold' ? { ...c, threshold: Math.max(0, Math.round(n)) } : { ...c, rewardAmount: Math.max(0, Math.round(n)) };
      }),
    );
  };

  const addDef = () => {
    setCatalog((cs) => [...cs, { id: newId(), title: 'Новое достижение', condition: 'hands', threshold: 0, rewardAmount: 0 }]);
  };

  const removeDef = (i: number) => setCatalog((cs) => cs.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setCatalog(DEFAULT_CATALOG);
  };

  const save = async () => {
    if (!catalog.length) {
      toast.error('Нужно хотя бы одно достижение');
      return;
    }
    setSaving(true);
    await saveConfig(token, { enabled, catalog });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Достижения</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            Одноразовые вехи с наградой в HUB-коинах — игрок забирает сам на странице «Награды».
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить достижения</span>
        </label>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Каталог</h3>
            <InfoButton onClick={openInfo('condition')} />
          </div>
          <button
            type="button"
            onClick={addDef}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Достижение
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm overflow-x-auto">
          <div className="grid grid-cols-[1.2fr_1.3fr_0.7fr_0.8fr_1fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs min-w-[680px]">
            <span>Название</span>
            <span>Условие</span>
            <span>Порог</span>
            <span>Награда (HUB)</span>
            <span>Сундук</span>
            <span />
          </div>
          {catalog.map((c, i) => (
            <div
              key={c.id}
              className="grid grid-cols-[1.2fr_1.3fr_0.7fr_0.8fr_1fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center min-w-[680px]"
            >
              <input
                type="text"
                value={c.title}
                onChange={(e) => editDef(i, 'title', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              />
              <select
                value={c.condition}
                onChange={(e) => editDef(i, 'condition', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              >
                {CONDITIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-gray-800">
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={c.threshold}
                onChange={(e) => editDef(i, 'threshold', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <input
                type="number"
                min={0}
                value={c.rewardAmount}
                onChange={(e) => editDef(i, 'rewardAmount', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <select
                value={c.chestId ?? ''}
                onChange={(e) => editDef(i, 'chestId', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              >
                <option value="" className="bg-gray-800">— фикс —</option>
                {chests.map((ch) => (
                  <option key={ch.id} value={ch.id} className="bg-gray-800">
                    {ch.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeDef(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить достижение"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={resetDefaults} className="mt-3 text-xs text-gray-500 hover:text-white">
          Сбросить к дефолтному каталогу
        </button>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить достижения'}
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

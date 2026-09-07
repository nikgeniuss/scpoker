import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMissionsStore, type MissionDef, type MissionCondition } from '../../store/missionsStore';
import { useChestsStore } from '../../store/chestsStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Миссии недели» вкладки «🎁 Награды» (ROADMAP §10.21.3). В отличие от достижений
// прогресс копится счётчиками на сервере и обнуляется каждую неделю — здесь редактируется
// только каталог: условие + порог + награда.

const CONDITIONS: { value: MissionCondition; label: string }[] = [
  { value: 'hands', label: 'Раздач за неделю' },
  { value: 'rake', label: 'Рейк за неделю (центы)' },
  { value: 'tournaments', label: 'Турниров за неделю' },
];

const DEFAULT_CATALOG: MissionDef[] = [
  { id: 'weekly-50-hands', title: '50 раздач за неделю', condition: 'hands', threshold: 50, rewardAmount: 15 },
  { id: 'weekly-200-hands', title: '200 раздач за неделю', condition: 'hands', threshold: 200, rewardAmount: 40 },
  { id: 'weekly-rake', title: 'Рейк за неделю', condition: 'rake', threshold: 1_000, rewardAmount: 30 },
  { id: 'weekly-3-tournaments', title: '3 турнира за неделю', condition: 'tournaments', threshold: 3, rewardAmount: 25 },
];

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Миссии недели',
    lines: [
      'Повторяющиеся задания: прогресс обнуляется каждый понедельник в 00:00 UTC, награду можно забрать заново на новой неделе.',
      'Отличие от достижений: те — одноразовые вехи за всё время, эти — недельные и повторяются.',
      'Пока механика выключена, счётчики НЕ копятся: после включения неделя начинается с нуля.',
      'Награда — HUB-коины, не реальные деньги.',
    ],
  },
  condition: {
    title: 'Условие миссии',
    lines: [
      '«Раздач за неделю» — считается на конце каждой раздачи, только за игроков-людей (боты не в счёт).',
      '«Рейк за неделю» — уплаченный рейк в центах (та же величина, что определяет тир рейкбэка), но за неделю, а не lifetime.',
      '«Турниров за неделю» — засчитывается на финише турнира, по одному разу на игрока: ре-энтри в тот же турнир второй раз не считается.',
      'Порог 0 означает «выполнено сразу» — награду можно будет забрать не играя.',
    ],
  },
};

function newId(): string {
  return 'mis-' + Math.random().toString(36).slice(2, 8);
}

export const MissionsRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useMissionsStore((s) => s.loadAdmin);
  const saveConfig = useMissionsStore((s) => s.saveConfig);
  const loaded = useMissionsStore((s) => s.loaded);
  // Каталог сундуков — чтобы вместо фиксированной награды можно было выбрать случайную (§10.21.7).
  const chests = useChestsStore((s) => s.catalog);
  const loadChests = useChestsStore((s) => s.loadAdmin);

  const [enabled, setEnabled] = useState(false);
  const [catalog, setCatalog] = useState<MissionDef[]>(DEFAULT_CATALOG);
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
    const s = useMissionsStore.getState();
    setEnabled(s.enabled);
    if (s.catalog.length) setCatalog(s.catalog);
  }, [loaded]);

  const editDef = (i: number, field: keyof MissionDef, value: string) => {
    setCatalog((cs) =>
      cs.map((c, j) => {
        if (j !== i) return c;
        if (field === 'title') return { ...c, title: value };
        // Пустое значение = фиксированная награда: поле не храним вовсе, чтобы не плодить '' в файле.
        if (field === 'chestId') return value ? { ...c, chestId: value } : { ...c, chestId: undefined };
        if (field === 'condition') return { ...c, condition: value as MissionCondition };
        const n = Number(value);
        if (!Number.isFinite(n)) return c;
        return field === 'threshold'
          ? { ...c, threshold: Math.max(0, Math.round(n)) }
          : { ...c, rewardAmount: Math.max(0, Math.round(n)) };
      }),
    );
  };

  const addDef = () => {
    setCatalog((cs) => [...cs, { id: newId(), title: 'Новая миссия', condition: 'hands', threshold: 0, rewardAmount: 0 }]);
  };

  const removeDef = (i: number) => setCatalog((cs) => cs.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setCatalog(DEFAULT_CATALOG);
  };

  const save = async () => {
    if (!catalog.length) {
      toast.error('Нужна хотя бы одна миссия');
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
            <h3 className="text-white font-bold text-lg">Миссии недели</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            Повторяющиеся задания с наградой в HUB-коинах — сбрасываются каждый понедельник.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить миссии</span>
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
            <Plus size={14} /> Миссия
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
                aria-label="Удалить миссию"
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
        {saving ? 'Сохраняем…' : 'Сохранить миссии'}
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

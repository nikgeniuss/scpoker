import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChestsStore, type ChestDef } from '../../store/chestsStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Сундуки» вкладки «🎁 Награды» (ROADMAP §10.21.7). Сундук — рандомизированная награда
// вместо фиксированной: в миссии/достижении выбирается сундук, и сервер разыгрывает приз по весам.
// Проценты рядом с весами считаются здесь же — админ видит ровно то, что увидит игрок.

const DEFAULT_CHESTS: ChestDef[] = [
  {
    id: 'chest-small',
    title: 'Малый сундук',
    prizes: [{ weight: 70, amount: 5 }, { weight: 25, amount: 20 }, { weight: 5, amount: 100 }],
  },
  {
    id: 'chest-big',
    title: 'Большой сундук',
    prizes: [{ weight: 60, amount: 25 }, { weight: 30, amount: 75 }, { weight: 10, amount: 300 }],
  },
];

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Сундуки',
    lines: [
      'Сундук заменяет фиксированную награду: приз разыгрывается сервером по весам таблицы, клиент получает готовый результат.',
      'Розыгрыш только на сервере и криптостойким генератором — предсказать или подделать выпадение с клиента нельзя.',
      'Шансы показываются игроку ОТКРЫТО на странице «Награды». Это сознательное решение: непрозрачные шансы дают жалобы, недоверие и лишние вопросы регуляторов.',
      'Выключенные сундуки ничего не ломают: миссия или достижение просто платит свою фиксированную награду, как раньше.',
    ],
  },
  weights: {
    title: 'Веса и шансы',
    lines: [
      'Вес — не процент, а доля: шанс = вес приза, делённый на сумму весов сундука. Веса 70/25/5 и 700/250/50 дают одинаковые шансы.',
      'Проценты рядом со строкой пересчитываются на лету — это ровно то, что увидит игрок.',
      'Приз с весом 0 недостижим и при сохранении отбрасывается; сундук, где не осталось призов, не сохраняется вовсе.',
      'Суммы — в HUB-коинах, не в реальных деньгах.',
    ],
  },
};

function newChestId(): string {
  return 'chest-' + Math.random().toString(36).slice(2, 8);
}

export const ChestsRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useChestsStore((s) => s.loadAdmin);
  const saveConfig = useChestsStore((s) => s.saveConfig);
  const loaded = useChestsStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [chests, setChests] = useState<ChestDef[]>(DEFAULT_CHESTS);
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
    const s = useChestsStore.getState();
    setEnabled(s.enabled);
    if (s.catalog.length) setChests(s.catalog);
  }, [loaded]);

  const editTitle = (ci: number, value: string) =>
    setChests((cs) => cs.map((c, i) => (i === ci ? { ...c, title: value } : c)));

  const editPrize = (ci: number, pi: number, field: 'weight' | 'amount', value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setChests((cs) =>
      cs.map((c, i) =>
        i !== ci
          ? c
          : { ...c, prizes: c.prizes.map((p, j) => (j === pi ? { ...p, [field]: Math.max(0, Math.round(n)) } : p)) },
      ),
    );
  };

  const addPrize = (ci: number) =>
    setChests((cs) => cs.map((c, i) => (i === ci ? { ...c, prizes: [...c.prizes, { weight: 1, amount: 0 }] } : c)));

  const removePrize = (ci: number, pi: number) =>
    setChests((cs) => cs.map((c, i) => (i === ci ? { ...c, prizes: c.prizes.filter((_, j) => j !== pi) } : c)));

  const addChest = () =>
    setChests((cs) => [...cs, { id: newChestId(), title: 'Новый сундук', prizes: [{ weight: 1, amount: 10 }] }]);

  const removeChest = (ci: number) => setChests((cs) => cs.filter((_, i) => i !== ci));

  const save = async () => {
    if (!chests.length) {
      toast.error('Нужен хотя бы один сундук');
      return;
    }
    if (chests.some((c) => c.prizes.reduce((sum, p) => sum + p.weight, 0) <= 0)) {
      toast.error('В каждом сундуке нужен хотя бы один приз с весом больше нуля');
      return;
    }
    setSaving(true);
    await saveConfig(token, { enabled, chests });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Сундуки</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            Случайная награда вместо фиксированной — выбирается в миссии или достижении. Шансы видны игроку.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить сундуки</span>
        </label>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Таблицы призов</h3>
            <InfoButton onClick={openInfo('weights')} />
          </div>
          <button
            type="button"
            onClick={addChest}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Сундук
          </button>
        </div>

        {chests.map((chest, ci) => {
          const total = chest.prizes.reduce((sum, p) => sum + p.weight, 0);
          return (
            <div key={chest.id} className="rounded-xl border border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chest.title}
                  onChange={(e) => editTitle(ci, e.target.value)}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:border-emerald-400"
                />
                <span className="text-xs text-gray-500 font-mono truncate hidden sm:block">{chest.id}</span>
                <button
                  type="button"
                  onClick={() => removeChest(ci)}
                  className="text-gray-500 hover:text-red-400 shrink-0"
                  aria-label="Удалить сундук"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="rounded-lg border border-white/10 overflow-hidden text-sm overflow-x-auto">
                <div className="grid grid-cols-[0.8fr_0.8fr_0.8fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs min-w-[360px]">
                  <span>Вес</span>
                  <span>Приз (HUB)</span>
                  <span>Шанс</span>
                  <span />
                </div>
                {chest.prizes.map((p, pi) => (
                  <div
                    key={pi}
                    className="grid grid-cols-[0.8fr_0.8fr_0.8fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center min-w-[360px]"
                  >
                    <input
                      type="number"
                      min={0}
                      value={p.weight}
                      onChange={(e) => editPrize(ci, pi, 'weight', e.target.value)}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      value={p.amount}
                      onChange={(e) => editPrize(ci, pi, 'amount', e.target.value)}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
                    />
                    <span className="text-gray-400 tabular-nums text-xs">
                      {total > 0 ? Math.round((p.weight / total) * 1000) / 10 : 0}%
                    </span>
                    <button
                      type="button"
                      onClick={() => removePrize(ci, pi)}
                      className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                      aria-label="Удалить приз"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => addPrize(ci)} className="text-xs text-gray-500 hover:text-white">
                + Приз
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить сундуки'}
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

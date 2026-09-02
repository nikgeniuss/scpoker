import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useReferralStore } from '../../store/referralStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Реферальная программа» вкладки «🎁 Награды» (ROADMAP §10.21.5). Код и привязка —
// автоматика (auth.ts registerUser), здесь настраивается только порог и суммы наград.

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Реферальная программа',
    lines: [
      'Каждый игрок получает свой уникальный код и share-ссылку на странице «Пригласить друзей».',
      'Код привязывается ТОЛЬКО на регистрации — задним числом привязать существующий аккаунт нельзя.',
      'Награда выплачивается разово, когда приглашённый наиграет заданное число раздач — не сразу при регистрации (защита от «зарегался ради бонуса и ушёл»).',
    ],
  },
  antiFarm: {
    title: 'Защита от мультиаккаунтов',
    lines: [
      'Если новый аккаунт регистрируется с того же IP/устройства, что и реферер, или с того же IP/устройства, что и другой уже приглашённый аккаунт — связь сохраняется, но награда НЕ выплачивается.',
      'Это не блокирует само приглашение — заблокирована только выплата за конкретную подозрительную связь.',
    ],
  },
  threshold: {
    title: 'Порог и суммы',
    lines: [
      '«Раздач для награды» — сколько раздач должен сыграть приглашённый, прежде чем сработает выплата.',
      '«Награда рефереру» — сколько HUB-коинов получает пригласивший. «Приветственный бонус» — сколько получает сам приглашённый.',
    ],
  },
};

export const ReferralRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useReferralStore((s) => s.loadAdmin);
  const saveConfig = useReferralStore((s) => s.saveConfig);
  const loaded = useReferralStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [handsThreshold, setHandsThreshold] = useState(100);
  const [referrerReward, setReferrerReward] = useState(100);
  const [refereeReward, setRefereeReward] = useState(30);
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
    const s = useReferralStore.getState();
    setEnabled(s.enabled);
    if (typeof s.handsThreshold === 'number') setHandsThreshold(s.handsThreshold);
    if (typeof s.referrerReward === 'number') setReferrerReward(s.referrerReward);
    if (typeof s.refereeReward === 'number') setRefereeReward(s.refereeReward);
  }, [loaded]);

  const save = async () => {
    setSaving(true);
    await saveConfig(token, { enabled, handsThreshold, referrerReward, refereeReward });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Реферальная программа</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            HUB-коины и рефереру, и приглашённому — разово, когда приглашённый наиграет нужное число раздач.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить реферальную программу</span>
        </label>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <InfoButton onClick={openInfo('antiFarm')} />
          <span>Защита от мультиаккаунтов встроена — переиспользует IP/device из anti-collusion</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold">Порог и суммы</h3>
          <InfoButton onClick={openInfo('threshold')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">Раздач для награды</div>
            <input
              type="number"
              min={1}
              value={handsThreshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setHandsThreshold(Math.max(1, Math.round(n)));
              }}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400 tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Награда рефереру (HUB)</div>
            <input
              type="number"
              min={0}
              value={referrerReward}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setReferrerReward(Math.max(0, Math.round(n)));
              }}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400 tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Приветственный бонус (HUB)</div>
            <input
              type="number"
              min={0}
              value={refereeReward}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setRefereeReward(Math.max(0, Math.round(n)));
              }}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400 tabular-nums"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить рефералку'}
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

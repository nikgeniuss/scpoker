import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { parseMoney } from '../../config/chipFormat';
import { useLobbyDesignStore } from '../../store/lobbyDesignStore';
import type { GameSettings, TimebankSettings, BotModeSettings } from './types';

export const SettingsTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Черновик-строки для числовых полей: пока поле в фокусе, храним сырой текст,
  // чтобы его можно было полностью очистить (иначе value залипает на 0).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
      const updated = await api.put<GameSettings>('/admin/settings', settings);
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

  type NumericKey = 'turnDurationMs' | 'autostartDelayMs' | 'defaultPlayerChips';
  const fields: Array<{
    key: NumericKey;
    label: string;
    hint: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    fromMs?: boolean;
  }> = [
    {
      key: 'turnDurationMs',
      label: 'Таймер хода',
      hint: '5–300 секунд. После истечения — auto-fold.',
      min: 5,
      max: 300,
      step: 1,
      unit: 'сек',
      fromMs: true,
    },
    {
      key: 'autostartDelayMs',
      label: 'Задержка автостарта раздачи',
      hint: '0–120 секунд после того, как в комнате стало ≥2 игроков.',
      min: 0,
      max: 120,
      step: 1,
      unit: 'сек',
      fromMs: true,
    },
    {
      key: 'defaultPlayerChips',
      label: 'Стартовый банкролл при регистрации',
      hint: 'Сколько фишек получает новый юзер при регистрации (можно 0). За стол игрок садится со своим текущим банкроллом из профиля.',
      min: 0,
      max: 1000000,
      step: 1,
      unit: '💰',
    },
  ];

  return (
    <div className="space-y-6 pb-10 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-4">Настройки игры</h2>

      {fields.map((f) => {
        const raw = settings[f.key];
        if (typeof raw !== 'number') return null;
        const isMoney = f.key === 'defaultPlayerChips';
        const display = f.fromMs ? raw / 1000 : isMoney ? raw / 100 : raw;
        return (
          <div key={String(f.key)} className="bg-gray-800 rounded-2xl p-4 border border-white/10">
            <label className="block text-white font-bold mb-1">{f.label}</label>
            <p className="text-sm text-gray-500 mb-3">{f.hint}</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={drafts[f.key] ?? String(display)}
                onChange={(e) => {
                  const str = e.target.value;
                  setDrafts((d) => ({ ...d, [f.key]: str }));
                  if (str === '') return; // пустое поле во время ввода — не трогаем state
                  if (isMoney) {
                    setSettings((prev) => (prev ? { ...prev, [f.key]: parseMoney(str) } : prev));
                    return;
                  }
                  const v = Number(str);
                  if (!Number.isFinite(v)) return;
                  setSettings((prev) =>
                    prev ? { ...prev, [f.key]: f.fromMs ? Math.round(v * 1000) : Math.round(v) } : prev
                  );
                }}
                onBlur={() => {
                  // Нормализация при потере фокуса: clamp в [min..max], чистим черновик.
                  setSettings((prev) => {
                    if (!prev) return prev;
                    const cur = prev[f.key];
                    if (typeof cur !== 'number') return prev;
                    const disp = f.fromMs ? cur / 1000 : isMoney ? cur / 100 : cur;
                    const clamped = Math.min(f.max, Math.max(f.min, disp));
                    const stored = f.fromMs ? Math.round(clamped * 1000) : isMoney ? Math.round(clamped * 100) : Math.round(clamped);
                    return stored === cur ? prev : { ...prev, [f.key]: stored };
                  });
                  setDrafts((d) => {
                    const n = { ...d };
                    delete n[f.key];
                    return n;
                  });
                }}
                className="w-32 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold"
              />
              <span className="text-gray-400 text-sm">{f.unit}</span>
            </div>
          </div>
        );
      })}

      <TimebankSection
        tb={settings.timebank}
        onChange={(next) =>
          setSettings((prev) => (prev ? { ...prev, timebank: next } : prev))
        }
      />

      <BotModeSection
        bm={settings.botMode}
        onChange={(next) =>
          setSettings((prev) => (prev ? { ...prev, botMode: next } : prev))
        }
      />

      <LobbyDesignSection />

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить настройки'}
      </motion.button>

      <p className="text-xs text-gray-500">
        Изменения применяются к новым действиям. Активные таймеры хода и автостарта доиграют по старым значениям.
      </p>

      <BroadcastSection api={api} />
    </div>
  );
};

// Переключатель «какую версию /lobby видят все игроки» — классика или редизайн.
// Своя независимая персистентность (server/data/lobbyDesign.json), сохраняется сразу по клику.
const LobbyDesignSection = () => {
  const { token } = useAuthStore();
  const design = useLobbyDesignStore((s) => s.design);
  const loadAdmin = useLobbyDesignStore((s) => s.loadAdmin);
  const setDesign = useLobbyDesignStore((s) => s.setDesign);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  return (
    <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
      <div>
        <h3 className="text-white font-bold text-lg mb-1">Дизайн лобби</h3>
        <p className="text-sm text-gray-500">Какую версию страницы /lobby видят все игроки.</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setDesign(token, 'classic')}
          className={
            'px-4 py-2 rounded-lg font-bold text-sm transition-all ' +
            (design === 'classic' ? 'bg-poker-gold text-black' : 'bg-gray-900 text-gray-300 border border-white/10 hover:bg-gray-700')
          }
        >
          Классика
        </button>
        <button
          onClick={() => setDesign(token, 'redesign')}
          className={
            'px-4 py-2 rounded-lg font-bold text-sm transition-all ' +
            (design === 'redesign' ? 'bg-poker-gold text-black' : 'bg-gray-900 text-gray-300 border border-white/10 hover:bg-gray-700')
          }
        >
          Редизайн
        </button>
      </div>
    </div>
  );
};

// Рассылка broadcast-уведомления всем игрокам (ROADMAP §10.7).
interface BroadcastSectionProps {
  api: ReturnType<typeof useAdminApi>;
}

const BroadcastSection = ({ api }: BroadcastSectionProps) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await api.post<{ count: number }>('/admin/inbox/broadcast', { text: text.trim() });
      toast.success(`Отправлено ${res.count} игрок${res.count === 1 ? 'у' : res.count < 5 ? 'ам' : 'ам'}`);
      setText('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
      <div>
        <h3 className="text-white font-bold text-lg mb-1">Рассылка уведомлений</h3>
        <p className="text-sm text-gray-500">Сообщение придёт во «Входящие» всем зарегистрированным игрокам.</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        placeholder="Текст сообщения (до 500 символов)…"
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold resize-none text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{text.length}/500</span>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={sending || !text.trim()}
          onClick={send}
          className="px-5 py-2 rounded-lg font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 disabled:opacity-40 text-sm"
        >
          {sending ? 'Отправляем…' : 'Отправить всем'}
        </motion.button>
      </div>
    </div>
  );
};

// Секция настроек таймбанка (см. roadmap 10.6).
// Toggle «разрешить настройку при создании стола» открывает игроку выбор в CreateRoomModal.
// Если выключено — все новые столы копируют этот глобальный конфиг.
interface TimebankSectionProps {
  tb: TimebankSettings;
  onChange: (next: TimebankSettings) => void;
}

const TimebankSection = ({ tb, onChange }: TimebankSectionProps) => {
  const update = <K extends keyof TimebankSettings>(key: K, value: TimebankSettings[K]) =>
    onChange({ ...tb, [key]: value });

  const numField = (key: 'startSec' | 'bonusSec' | 'bonusEveryHands' | 'capSec', label: string, hint: string, min: number, max: number, unit: string) => (
    <div>
      <label className="block text-white text-sm font-bold mb-1">{label}</label>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={tb[key]}
          disabled={!tb.enabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            update(key, Math.max(min, Math.min(max, Math.round(v))));
          }}
          className="w-28 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
        />
        <span className="text-gray-400 text-sm">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
      <div>
        <h3 className="text-white font-bold text-lg mb-1">Таймбанк</h3>
        <p className="text-sm text-gray-500">
          Дополнительные секунды, которые срабатывают автоматически после истечения обычного времени хода.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={tb.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="accent-emerald-500 w-4 h-4"
        />
        <span className="text-white font-bold">Включить таймбанк</span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={tb.allowPerTableOverride}
          onChange={(e) => update('allowPerTableOverride', e.target.checked)}
          className="accent-emerald-500 w-4 h-4 mt-0.5"
        />
        <div>
          <span className="text-white font-bold block">Разрешить настройку при создании стола</span>
          <span className="text-xs text-gray-500">
            Если включено — в форме создания стола появится отдельный блок таймбанка. Если выключено —
            все новые столы используют эти глобальные значения.
          </span>
        </div>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {numField('startSec', 'Стартовый запас', 'Сколько секунд таймбанка получает игрок при посадке.', 0, 600, 'сек')}
        {numField('bonusSec', 'Бонус за активность', 'Сколько секунд добавляется в таймбанк каждые N рук.', 0, 600, 'сек')}
        {numField('bonusEveryHands', 'Раз в N рук', 'Через сколько рук срабатывает пополнение.', 1, 1000, 'рук')}
        {numField('capSec', 'Максимум (cap)', 'Сверху таймбанк не накапливается, как бы долго ни играли.', 0, 600, 'сек')}
      </div>
    </div>
  );
};

// Секция настроек бот-режима (см. roadmap admin-tools).
// Toggle включает автоматическое создание 3-х бот-столов с ботами.
interface BotModeSectionProps {
  bm: BotModeSettings;
  onChange: (next: BotModeSettings) => void;
}

const BotModeSection = ({ bm, onChange }: BotModeSectionProps) => {
  const update = <K extends keyof BotModeSettings>(key: K, value: BotModeSettings[K]) =>
    onChange({ ...bm, [key]: value });

  return (
    <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
      <div>
        <h3 className="text-white font-bold text-lg mb-1">Бот-режим</h3>
        <p className="text-sm text-gray-500">
          Автоматическое создание игровых столов с ботами для имитации онлайна. Боты ходят и
          играют сами по своей логике (см. вкладку «Боты» для настройки целей PnL).
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={bm.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="accent-emerald-500 w-4 h-4"
        />
        <span className="text-white font-bold">Включить бот-режим</span>
      </label>

      <div>
        <label className="block text-white text-sm font-bold mb-1">Режим peek (видения карт)</label>
        <p className="text-xs text-gray-500 mb-2">
          Когда бот «видит» карты соперников и будущий борд. River — только на ривере (рекомендуется).
          Full — со старта раздачи (требует точной настройки антифрода).
        </p>
        <select
          value={bm.peekMode}
          onChange={(e) => update('peekMode', e.target.value as BotModeSettings['peekMode'])}
          disabled={!bm.enabled}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
        >
          <option value="river">River (только ривер)</option>
          <option value="turn">Turn (с тёрна)</option>
          <option value="full">Full (со старта)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-white text-sm font-bold mb-1">Макс. ботов за стол</label>
          <p className="text-xs text-gray-500 mb-2">2–8. Реальное число варьируется (от 2 до этого) и «дышит». По умолчанию 6.</p>
          <input
            type="number"
            min={2}
            max={8}
            value={bm.botsPerTable}
            disabled={!bm.enabled}
            onChange={(e) => update('botsPerTable', Math.max(2, Math.min(8, Math.round(Number(e.target.value) || 6))))}
            className="w-28 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
          />
        </div>
        <div>
          <label className="block text-white text-sm font-bold mb-1">Buy-in (BB)</label>
          <p className="text-xs text-gray-500 mb-2">Размер бай-ина бота в больших блайндах.</p>
          <input
            type="number"
            min={20}
            max={1000}
            value={bm.defaultBuyInBb}
            disabled={!bm.enabled}
            onChange={(e) => update('defaultBuyInBb', Math.max(20, Math.min(1000, Math.round(Number(e.target.value) || 100))))}
            className="w-28 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
          />
        </div>
        <div>
          <label className="block text-white text-sm font-bold mb-1">Refill (мс)</label>
          <p className="text-xs text-gray-500 mb-2">Как часто проверять, что бот-столы укомплектованы. 30000–600000.</p>
          <input
            type="number"
            min={30000}
            max={600000}
            step={10000}
            value={bm.refillIntervalMs}
            disabled={!bm.enabled}
            onChange={(e) => update('refillIntervalMs', Math.max(30000, Math.min(600000, Math.round(Number(e.target.value) || 120000))))}
            className="w-32 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-white outline-none focus:border-poker-gold disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
};

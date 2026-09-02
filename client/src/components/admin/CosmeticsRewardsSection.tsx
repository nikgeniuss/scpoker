import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useInventoryStore, type CosmeticItem } from '../../store/inventoryStore';
import { FRAME_STYLES, TABLE_GLOW_STYLES } from '../../config/cosmetics';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Косметика» вкладки «🎁 Награды» (ROADMAP §10.21.11-12). Каталог — 4 типа: рамка
// аватара / титул под ником (видны ВСЕМ за столом), эксклюзивное эмодзи (можно слать в общую
// EmojiPalette, видно всем при отправке — владение перепроверяется сервером) и личная подсветка
// стола (видна ТОЛЬКО покупателю). Рамка/подсветка — ключ из фиксированного набора стилей, не
// произвольный CSS через админку (риск инъекции). Титул/эмодзи — произвольный текст, рендерится
// клиентом как текст, не HTML. Чисто декоративный слой — на игру не влияет, экономически
// бесплатен для рума (в отличие от тикетов не тратит призовой фонд, анти-фарм не нужен).

const DEFAULT_CATALOG: CosmeticItem[] = [
  { id: 'frame-bronze', type: 'avatarFrame', name: 'Бронзовая рамка', cost: 200, value: 'bronze' },
  { id: 'frame-silver', type: 'avatarFrame', name: 'Серебряная рамка', cost: 600, value: 'silver' },
  { id: 'frame-gold', type: 'avatarFrame', name: 'Золотая рамка', cost: 1500, value: 'gold' },
  { id: 'frame-emerald', type: 'avatarFrame', name: 'Изумрудная рамка', cost: 3000, value: 'emerald' },
  { id: 'title-regular', type: 'title', name: 'Титул «Регуляр»', cost: 150, value: 'Регуляр' },
  { id: 'title-shark', type: 'title', name: 'Титул «🦈 Акула стола»', cost: 400, value: '🦈 Акула стола' },
  { id: 'title-legend', type: 'title', name: 'Титул «Легенда»', cost: 1000, value: 'Легенда' },
  { id: 'emoji-shark', type: 'emoji', name: 'Эксклюзивное эмодзи 🦈', cost: 300, value: '🦈' },
  { id: 'emoji-crown', type: 'emoji', name: 'Эксклюзивное эмодзи 👑', cost: 500, value: '👑' },
  { id: 'glow-emerald', type: 'tableGlow', name: 'Подсветка стола: изумруд', cost: 400, value: 'emerald' },
  { id: 'glow-sapphire', type: 'tableGlow', name: 'Подсветка стола: сапфир', cost: 400, value: 'sapphire' },
  { id: 'glow-ruby', type: 'tableGlow', name: 'Подсветка стола: рубин', cost: 400, value: 'ruby' },
  { id: 'glow-violet', type: 'tableGlow', name: 'Подсветка стола: аметист', cost: 400, value: 'violet' },
];

// Значение по умолчанию при смене типа в дропдауне — чтобы value сразу было валидным для нового типа.
const DEFAULT_VALUE_FOR_TYPE: Record<CosmeticItem['type'], string> = {
  avatarFrame: FRAME_STYLES[0],
  tableGlow: TABLE_GLOW_STYLES[0],
  title: '',
  emoji: '',
};

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Косметика',
    lines: [
      'Обмен HUB-коинов на визуальные предметы: рамка аватара, титул под ником, эксклюзивное эмодзи, личная подсветка стола. Предмет покупается один раз и остаётся в инвентаре навсегда.',
      'Рамка/титул — видны за столом всем игрокам (десктоп+мобила). Эмодзи — можно слать в общую палитру реакций, видно всем при отправке. Подсветка стола — видна ТОЛЬКО покупателю.',
      'Чисто декоративно — на игру не влияет. В отличие от тикетов на турнир — не тратит призовой фонд рума.',
    ],
  },
  value: {
    title: 'Значение предмета',
    lines: [
      'Рамка / подсветка стола — стиль из фиксированного списка (не произвольный цвет/CSS).',
      'Титул — произвольный текст, до 24 символов. Эмодзи — сам символ. Рендерится как обычный текст, не HTML.',
    ],
  },
};

export const CosmeticsRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useInventoryStore((s) => s.loadAdmin);
  const saveConfig = useInventoryStore((s) => s.saveConfig);
  const loaded = useInventoryStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [catalog, setCatalog] = useState<CosmeticItem[]>(DEFAULT_CATALOG);
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
    const s = useInventoryStore.getState();
    setEnabled(s.enabled);
    if (s.catalog.length) setCatalog(s.catalog);
  }, [loaded]);

  const editItem = (i: number, field: keyof CosmeticItem, value: string) => {
    setCatalog((items) =>
      items.map((it, j) => {
        if (j !== i) return it;
        if (field === 'name') return { ...it, name: value };
        if (field === 'cost') {
          const n = Number(value);
          return Number.isFinite(n) ? { ...it, cost: Math.max(0, Math.round(n)) } : it;
        }
        if (field === 'type') {
          const type = (['avatarFrame', 'title', 'emoji', 'tableGlow'] as const).includes(value as CosmeticItem['type'])
            ? (value as CosmeticItem['type'])
            : 'avatarFrame';
          return { ...it, type, value: DEFAULT_VALUE_FOR_TYPE[type] };
        }
        return { ...it, value };
      }),
    );
  };

  const addItem = () => {
    setCatalog((items) => [
      ...items,
      { id: 'item-' + Math.random().toString(36).slice(2, 8), type: 'avatarFrame', name: 'Новая рамка', cost: 0, value: FRAME_STYLES[0] },
    ]);
  };

  const removeItem = (i: number) => setCatalog((items) => items.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setCatalog(DEFAULT_CATALOG);
  };

  const save = async () => {
    if (!catalog.length) {
      toast.error('Нужен хотя бы один предмет в каталоге');
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
            <h3 className="text-white font-bold text-lg">Косметика</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            HUB-коины → рамка аватара / титул под ником (видно за столом всем игрокам).
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить косметику</span>
        </label>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Каталог предметов</h3>
            <InfoButton onClick={openInfo('value')} />
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Предмет
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm overflow-x-auto">
          <div className="grid grid-cols-[1.2fr_0.9fr_0.7fr_1fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs min-w-[560px]">
            <span>Название</span>
            <span>Тип</span>
            <span>Цена (HUB)</span>
            <span>Значение</span>
            <span />
          </div>
          {catalog.map((item, i) => (
            <div key={item.id} className="grid grid-cols-[1.2fr_0.9fr_0.7fr_1fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center min-w-[560px]">
              <input
                type="text"
                value={item.name}
                onChange={(e) => editItem(i, 'name', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              />
              <select
                value={item.type}
                onChange={(e) => editItem(i, 'type', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              >
                <option value="avatarFrame" className="bg-gray-800">Рамка</option>
                <option value="title" className="bg-gray-800">Титул</option>
                <option value="emoji" className="bg-gray-800">Эмодзи</option>
                <option value="tableGlow" className="bg-gray-800">Подсветка стола</option>
              </select>
              <input
                type="number"
                min={0}
                value={item.cost}
                onChange={(e) => editItem(i, 'cost', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              {item.type === 'avatarFrame' || item.type === 'tableGlow' ? (
                <select
                  value={item.value}
                  onChange={(e) => editItem(i, 'value', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
                >
                  {(item.type === 'avatarFrame' ? FRAME_STYLES : TABLE_GLOW_STYLES).map((style) => (
                    <option key={style} value={style} className="bg-gray-800">{style}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  maxLength={item.type === 'emoji' ? 8 : 24}
                  value={item.value}
                  onChange={(e) => editItem(i, 'value', e.target.value)}
                  placeholder={item.type === 'emoji' ? '🦈' : 'Текст титула'}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
                />
              )}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить предмет"
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
        {saving ? 'Сохраняем…' : 'Сохранить косметику'}
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

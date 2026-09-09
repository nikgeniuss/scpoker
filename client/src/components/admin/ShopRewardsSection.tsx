import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useShopStore, type ShopItem } from '../../store/shopStore';
import { formatMoney, parseMoney } from '../../config/chipFormat';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Магазин лояльности» вкладки «🎁 Награды» (ROADMAP §10.21.6). Каталог — турнирные
// тикеты (house-funded вход, см. loyaltyShopService.ts) и подписки на HUD соперников (§10.21.13).
// Без реальных чипсов и без косметики (у неё своя секция).

const DEFAULT_CATALOG: ShopItem[] = [
  { id: 'ticket-100', title: 'Тикет на турнир (бай-ин 100)', cost: 300, ticketBuyIn: 100, kind: 'ticket', subDays: 0 },
  { id: 'ticket-500', title: 'Тикет на турнир (бай-ин 500)', cost: 1200, ticketBuyIn: 500, kind: 'ticket', subDays: 0 },
  { id: 'hud-sub-30', title: 'HUD соперников — 30 дней', cost: 500, ticketBuyIn: 0, kind: 'hudSub', subDays: 30 },
];

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Магазин лояльности',
    lines: [
      'Обмен HUB-коинов на бесплатный (house-funded) вход в турнир с указанным бай-ином.',
      'Игрок сам выбирает, в какой ИМЕННО открытый турнир с подходящим бай-ином потратить тикет — на странице «Магазин».',
      'Рум оплачивает бай-ин турниру из своего кармана (как гарантированный приз/боты-заполнители) — банкролл игрока не трогается.',
    ],
  },
  ticketBuyIn: {
    title: 'Бай-ин турнира',
    lines: [
      'Тикет сработает ТОЛЬКО на турнире с бай-ином, который совпадает с этим значением — сервер перепроверяет совпадение при обмене.',
      'Если сейчас нет открытых турниров с таким бай-ином — игрок увидит это в магазине и не сможет обменять.',
    ],
  },
  hudSub: {
    title: 'Подписка на HUD',
    lines: [
      'Позиция типа «Подписка на HUD» продаёт доступ к статистике соперников (VPIP/PFR) на указанный срок в днях.',
      'Работает только когда во вкладке «Платные фичи» режим HUD переключён на «По подписке» — иначе статистика и так видна всем, и такая позиция игроку в магазине не показывается.',
      'Покупка продлевает подписку от текущей даты окончания, а не от сегодня: покупка за день до конца не сжигает остаток.',
      'Ограничение серверное — без активной подписки цифры не уходят на клиент вовсе (прятать их только в интерфейсе было бы обходимо через DevTools).',
    ],
  },
  antiFarm: {
    title: 'Защита от мультиаккаунтов',
    lines: [
      'Несколько аккаунтов с одного устройства/IP не смогут по очереди обменивать HUB-коины на sponsored-входы — это была бы прямая утечка призового фонда рума.',
    ],
  },
};

export const ShopRewardsSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useShopStore((s) => s.loadAdmin);
  const saveConfig = useShopStore((s) => s.saveConfig);
  const loaded = useShopStore((s) => s.loaded);

  const [enabled, setEnabled] = useState(false);
  const [catalog, setCatalog] = useState<ShopItem[]>(DEFAULT_CATALOG);
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
    const s = useShopStore.getState();
    setEnabled(s.enabled);
    if (s.catalog.length) setCatalog(s.catalog);
  }, [loaded]);

  const editItem = (i: number, field: keyof ShopItem, value: string) => {
    setCatalog((items) =>
      items.map((it, j) => {
        if (j !== i) return it;
        if (field === 'title') return { ...it, title: value };
        if (field === 'cost') {
          const n = Number(value);
          return Number.isFinite(n) ? { ...it, cost: Math.max(0, Math.round(n)) } : it;
        }
        if (field === 'kind') {
          const kind: ShopItem['kind'] = value === 'hudSub' ? 'hudSub' : 'ticket';
          // Подписке бай-ин не нужен, тикету — срок: чистим лишнее, чтобы в каталоге не оставались
          // значения, которые ни на что не влияют, но выглядят как настройка.
          return { ...it, kind, ticketBuyIn: kind === 'ticket' ? it.ticketBuyIn : 0, subDays: kind === 'hudSub' ? it.subDays : 0 };
        }
        if (field === 'subDays') {
          const n = Number(value);
          return Number.isFinite(n) ? { ...it, subDays: Math.max(0, Math.round(n)) } : it;
        }
        // ticketBuyIn — ввод в долларах через parseMoney (та же денежная единица, что бай-ин турнира)
        return { ...it, ticketBuyIn: value === '' ? 0 : parseMoney(value) };
      }),
    );
  };

  const addItem = () => {
    setCatalog((items) => [
      ...items,
      { id: 'ticket-' + Math.random().toString(36).slice(2, 8), title: 'Новый тикет', cost: 0, ticketBuyIn: 0, kind: 'ticket', subDays: 0 },
    ]);
  };

  const removeItem = (i: number) => setCatalog((items) => items.filter((_, j) => j !== i));
  const resetDefaults = () => {
    setEnabled(false);
    setCatalog(DEFAULT_CATALOG);
  };

  const save = async () => {
    if (!catalog.length) {
      toast.error('Нужна хотя бы одна позиция в каталоге');
      return;
    }
    const badSub = catalog.find((i) => i.kind === 'hudSub' && i.subDays <= 0);
    if (badSub) {
      toast.error('У подписки «' + badSub.title + '» срок должен быть больше 0 дней');
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
            <h3 className="text-white font-bold text-lg">Магазин лояльности</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            HUB-коины → house-funded вход в турнир с указанным бай-ином (без списания банкролла игрока).
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить магазин</span>
        </label>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <InfoButton onClick={openInfo('antiFarm')} />
          <span>Защита от мультиаккаунтов встроена</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold">Каталог</h3>
            <InfoButton onClick={openInfo('ticketBuyIn')} />
            <InfoButton onClick={openInfo('hudSub')} />
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10"
          >
            <Plus size={14} /> Тикет
          </button>
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden text-sm overflow-x-auto">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.9fr_2rem] gap-2 px-3 py-2 bg-gray-900 font-bold text-gray-400 text-xs min-w-[560px]">
            <span>Название</span>
            <span>Цена (HUB)</span>
            <span>Тип</span>
            <span>Бай-ин ($) / срок (дн.)</span>
            <span />
          </div>
          {catalog.map((item, i) => (
            <div key={item.id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.9fr_2rem] gap-2 px-3 py-2 border-t border-white/5 items-center min-w-[560px]">
              <input
                type="text"
                value={item.title}
                onChange={(e) => editItem(i, 'title', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              />
              <input
                type="number"
                min={0}
                value={item.cost}
                onChange={(e) => editItem(i, 'cost', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
              />
              <select
                value={item.kind}
                onChange={(e) => editItem(i, 'kind', e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400"
              >
                <option value="ticket" className="bg-gray-800">Тикет</option>
                <option value="hudSub" className="bg-gray-800">Подписка на HUD</option>
              </select>
              {item.kind === 'hudSub' ? (
                <input
                  type="number"
                  min={0}
                  value={item.subDays}
                  onChange={(e) => editItem(i, 'subDays', e.target.value)}
                  title="Срок подписки в днях"
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.ticketBuyIn / 100}
                  onChange={(e) => editItem(i, 'ticketBuyIn', e.target.value)}
                  title={formatMoney(item.ticketBuyIn)}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-emerald-400 tabular-nums"
                />
              )}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-gray-500 hover:text-red-400 flex items-center justify-center"
                aria-label="Удалить тикет"
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
        {saving ? 'Сохраняем…' : 'Сохранить магазин'}
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

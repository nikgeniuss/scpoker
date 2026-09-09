import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useBonusStore, type BonusCurrency } from '../../store/bonusStore';
import { InfoButton, InfoSheet } from '../lobby/createControls';

// Секция «Депозитный бонус» вкладки «🎁 Награды» (ROADMAP §10.21.9). Бонус выдаётся автоматикой
// при зачислении депозита (depositPollingService) и открывается уплаченным рейком — здесь только
// настройки: валюта выплаты, проценты, потолок, ставка отыгрыша и срок.

const INFO: Record<string, { title: string; lines: string[] }> = {
  toggle: {
    title: 'Депозитный бонус',
    lines: [
      'Бонус начисляется автоматически при зачислении депозита и лежит запертым: он открывается по мере рейка, который игрок платит за столами.',
      'Открытую часть игрок забирает сам кнопкой на странице «Награды» — молча в стек ничего не падает.',
      'Выключение останавливает и выдачу новых бонусов, и отыгрыш уже выданных.',
    ],
  },
  currency: {
    title: 'Валюта выплаты',
    lines: [
      '«Реальные фишки» — забранный бонус уходит в банкролл игрока и может быть выведен в USDT. Это настоящий депозитный бонус, но и настоящий расход рума.',
      '«HUB-коины» — забранный бонус попадает в кошелёк наград, вывести его нельзя, тратится в магазине лояльности. Риска для банкролла нет.',
      'Валюта фиксируется в момент выдачи бонуса: переключение настройки меняет только новые бонусы, уже выданные останутся в своей валюте.',
      'Помните про масштаб: 1 USDT = 100.00 фишек по курсу платежей, а HUB-коины откалиброваны по рейку (тикет на турнир — 300 HUB). Проценты под эти две валюты нужны РАЗНЫЕ.',
    ],
  },
  percents: {
    title: 'Проценты и потолок',
    lines: [
      '«Первый депозит» и «Повторные» — процент от суммы депозита, который выдаётся бонусом.',
      '«Потолок бонуса» ограничивает сумму ОДНОГО бонуса в единицах выбранной валюты (для фишек — центы: 50000 = $500 игровых).',
      '«Минимальный депозит» — депозит меньше этой суммы бонуса не даёт (центы фишек).',
    ],
  },
  rake: {
    title: 'Отыгрыш рейком',
    lines: [
      '«Рейка на единицу бонуса» — сколько рейка игрок должен заплатить, чтобы открыть 1 единицу бонуса. 3 означает: за 3 отыгранного рейка открывается 1 бонуса.',
      'Чем выше значение, тем дешевле бонус руму. Учтите, что с того же рейка уже кормятся рейкбэк и доля рефереру.',
      'Несколько бонусов открываются по очереди: сначала самый старый, остаток рейка переходит следующему.',
      '«Турнирная комиссия в зачёт» — засчитывать ли рейк с турнирных бай-инов наравне с кэш-рейком. Комиссия зачитывается на старте турнира (до старта вход можно отменить), промо-входы и боты не считаются.',
    ],
  },
  lifetime: {
    title: 'Срок жизни',
    lines: [
      'Сколько дней у игрока есть на отыгрыш. По истечении сгорает только НЕоткрытая часть.',
      'Уже открытое, но не забранное, не сгорает — игрок сможет забрать его и после окончания срока.',
    ],
  },
};

export const DepositBonusSection = () => {
  const token = useAuthStore((s) => s.token);
  const loadAdmin = useBonusStore((s) => s.loadAdmin);
  const saveConfig = useBonusStore((s) => s.saveConfig);
  const configLoaded = useBonusStore((s) => s.configLoaded);

  const [enabled, setEnabled] = useState(false);
  const [currency, setCurrency] = useState<BonusCurrency>('hub');
  const [firstPercent, setFirstPercent] = useState(100);
  const [reloadPercent, setReloadPercent] = useState(50);
  const [maxBonusAmount, setMaxBonusAmount] = useState(50_000);
  const [minDepositChips, setMinDepositChips] = useState(1_000);
  const [rakeMultiplier, setRakeMultiplier] = useState(3);
  const [lifetimeDays, setLifetimeDays] = useState(30);
  const [countTournamentRake, setCountTournamentRake] = useState(true);
  const [saving, setSaving] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (k: string) => () => setInfoKey(k);
  const seeded = useRef(false);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  useEffect(() => {
    if (seeded.current || !configLoaded) return;
    seeded.current = true;
    const c = useBonusStore.getState().config;
    if (!c) return;
    setEnabled(c.enabled);
    setCurrency(c.currency);
    setFirstPercent(c.firstPercent);
    setReloadPercent(c.reloadPercent);
    setMaxBonusAmount(c.maxBonusAmount);
    setMinDepositChips(c.minDepositChips);
    setRakeMultiplier(c.rakeMultiplier);
    setLifetimeDays(c.lifetimeDays);
    setCountTournamentRake(c.countTournamentRake);
  }, [configLoaded]);

  const save = async () => {
    setSaving(true);
    await saveConfig(token, {
      enabled,
      currency,
      firstPercent,
      reloadPercent,
      maxBonusAmount,
      minDepositChips,
      rakeMultiplier,
      lifetimeDays,
      countTournamentRake,
    });
    setSaving(false);
    toast.success('Настройки сохранены');
  };

  const numberInput = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-emerald-400 tabular-nums';

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">Депозитный бонус</h3>
            <InfoButton onClick={openInfo('toggle')} />
          </div>
          <p className="text-sm text-gray-500">
            Начисляется на депозит и открывается уплаченным рейком. Игрок забирает открытое сам.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white font-bold">Включить депозитный бонус</span>
        </label>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">Валюта выплаты</span>
            <InfoButton onClick={openInfo('currency')} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrency('hub')}
              className={
                'flex-1 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ' +
                (currency === 'hub'
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10')
              }
            >
              HUB-коины
            </button>
            <button
              type="button"
              onClick={() => setCurrency('chips')}
              className={
                'flex-1 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ' +
                (currency === 'chips'
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10')
              }
            >
              Реальные фишки
            </button>
          </div>
          {currency === 'chips' && (
            <p className="text-xs text-amber-400/80 mt-2">
              Забранный бонус уходит в банкролл и может быть выведен в USDT — проверьте проценты и потолок.
            </p>
          )}
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold">Проценты и потолок</h3>
          <InfoButton onClick={openInfo('percents')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">Первый депозит (%)</div>
            <input
              type="number"
              min={0}
              max={1000}
              value={firstPercent}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setFirstPercent(Math.max(0, Math.min(1000, n)));
              }}
              className={numberInput}
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Повторные депозиты (%)</div>
            <input
              type="number"
              min={0}
              max={1000}
              value={reloadPercent}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setReloadPercent(Math.max(0, Math.min(1000, n)));
              }}
              className={numberInput}
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Потолок бонуса</div>
            <input
              type="number"
              min={0}
              value={maxBonusAmount}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setMaxBonusAmount(Math.max(0, Math.round(n)));
              }}
              className={numberInput}
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Минимальный депозит (центы)</div>
            <input
              type="number"
              min={0}
              value={minDepositChips}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setMinDepositChips(Math.max(0, Math.round(n)));
              }}
              className={numberInput}
            />
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold">Отыгрыш и срок</h3>
          <InfoButton onClick={openInfo('rake')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">Рейка на единицу бонуса</div>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={rakeMultiplier}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setRakeMultiplier(Math.max(0.1, n));
              }}
              className={numberInput}
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-gray-400">Срок жизни (дней)</span>
              <InfoButton onClick={openInfo('lifetime')} />
            </div>
            <input
              type="number"
              min={1}
              value={lifetimeDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setLifetimeDays(Math.max(1, Math.round(n)));
              }}
              className={numberInput}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={countTournamentRake}
            onChange={(e) => setCountTournamentRake(e.target.checked)}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-white text-sm">Засчитывать турнирную комиссию в отыгрыш</span>
        </label>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
      >
        {saving ? 'Сохраняем…' : 'Сохранить депозитный бонус'}
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

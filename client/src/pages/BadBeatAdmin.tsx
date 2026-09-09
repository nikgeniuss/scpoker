import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HandCards } from '../components/admin/badBeatCards';
import { BadBeatLogo } from '../components/admin/BadBeatLogo';
import { makeTripsPair, makeQuads } from '../components/admin/badBeatHands';
import type { PlayingCard } from '../components/admin/badBeatHands';
import { useBadBeatStore } from '../store/badBeatStore';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../config/chipFormat';
import { QUALIFY_CONDITIONS } from '../config/badBeat';

// Экран «Бэд-Бит Джекпот» (админ-view, экран 2 эталона) — admin-only (lazy за RequireAdmin, §0.12).
// Тумблер/настройки/пул — через badBeatStore на /api/admin/badbeat (детект и выплаты — на сервере,
// badBeatService.ts). Форматы — только NLH + Short Deck (memory game-formats); PLO/PLO5 и «Союз» убраны.

// Карточка-триггер формата: набор карт + подпись «Проиграть с … или старше».
const TriggerCard = ({
  format,
  formatColor,
  cards,
  caption,
}: {
  format: string;
  formatColor: string;
  cards: PlayingCard[];
  caption: string;
}) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 flex flex-col items-center">
    <div className="text-sm font-bold mb-2" style={{ color: formatColor }}>
      {format}
    </div>
    <div className="mb-2">
      <HandCards cards={cards} size="sm" />
    </div>
    <div className="text-[11px] text-gray-400 text-center">{caption}</div>
  </div>
);

export const BadBeatAdmin = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const enabled = useBadBeatStore((s) => s.enabled);
  const setEnabled = useBadBeatStore((s) => s.setEnabled);
  const pool = useBadBeatStore((s) => s.pool);
  const loadAdmin = useBadBeatStore((s) => s.loadAdmin);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  const rows = [
    { label: 'Пополнить', onClick: () => navigate('/club-admin/bad-beat/topup') },
    { label: 'История пополнения', onClick: () => navigate('/club-admin/bad-beat/topup-history') },
    { label: 'Настройки триггеров и блайндов', onClick: () => navigate('/club-admin/bad-beat/triggers') },
  ];

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/club-admin')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">Бэд-Бит Джекпот</h1>
        </div>

        {/* Баннер с суммой пула */}
        <div className="relative rounded-2xl overflow-hidden mb-5 h-24 flex items-center justify-between px-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/10">
          <BadBeatLogo className="h-20" />
          <span className="text-4xl font-black tabular-nums italic text-white/90">{formatMoney(pool)}</span>
        </div>

        {/* Тумблер вкл/выкл */}
        <div className="flex items-center justify-between py-4 border-b border-white/10">
          <span className="text-base font-medium">Бэд-бит Джекпот</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(token, !enabled)}
            className={
              'relative w-12 h-7 rounded-full transition-colors ' +
              (enabled ? 'bg-emerald-500' : 'bg-neutral-600')
            }
          >
            <span
              className={
                'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ' +
                (enabled ? 'translate-x-5' : '')
              }
            />
          </button>
        </div>

        {/* Строки-разделы */}
        {rows.map((r) => (
          <button
            key={r.label}
            onClick={r.onClick}
            className="w-full flex items-center justify-between py-4 border-b border-white/10 text-left hover:bg-white/5 transition-colors"
          >
            <span className="text-base font-medium">{r.label}</span>
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        ))}

        {/* Правила */}
        <h2 className="text-sm font-bold mt-7 mb-3">Правила Bad Beat Jackpot</h2>

        <h3 className="text-sm font-bold text-emerald-400 mb-3">Триггер бэд-бит джекпота</h3>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <TriggerCard
            format="NLH"
            formatColor="#22c55e"
            cards={makeTripsPair('A', 'J')}
            caption="Проиграть с AAAJJ или старше."
          />
          <TriggerCard
            format="Short Deck"
            formatColor="#f97316"
            cards={makeQuads('A')}
            caption="Проиграть с AAAA или старше."
          />
        </div>

        <h3 className="text-sm font-bold text-emerald-400 mb-3">Сорвать джек-пот</h3>
        <p className="text-sm text-gray-400 mb-2">
          Чтобы сорвать Bad Beat Jackpot, необходимо выполнить следующие условия:
        </p>
        <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5">
          {QUALIFY_CONDITIONS.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

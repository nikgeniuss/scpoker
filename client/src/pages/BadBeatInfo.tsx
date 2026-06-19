import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { BadBeatLogo } from '../components/admin/BadBeatLogo';
import { useBadBeatStore } from '../store/badBeatStore';
import { formatMoney } from '../config/chipFormat';
import { QUALIFY_CONDITIONS, TIER_DEFAULTS, fmt2 } from '../config/badBeat';

// Игрок-view «Бэд-Бит Джекпот» (экран 1 эталона) — read-only для всех игроков (RequireAuth).
// Пул берём из badBeatStore (пока local; с серверной логикой станет реальным). Таблица/условия — из
// общего конфига badBeat.ts. Форматы: NLH + Short Deck.

export const BadBeatInfo = () => {
  const navigate = useNavigate();
  const pool = useBadBeatStore((s) => s.pool);
  const storeTiers = useBadBeatStore((s) => s.tiers);
  const loadPublic = useBadBeatStore((s) => s.loadPublic);
  const tiers = storeTiers.length ? storeTiers : TIER_DEFAULTS;

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/lobby')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">Бэд-Бит Джекпот</h1>
        </div>

        {/* Баннер с суммой пула */}
        <div className="relative rounded-2xl overflow-hidden mb-6 h-24 flex items-center justify-between px-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/10">
          <BadBeatLogo className="h-20" />
          <span className="text-4xl font-black tabular-nums italic text-white/90">{formatMoney(pool)}</span>
        </div>

        {/* Условия */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">Сорвать джек-пот</h2>
        <p className="text-sm text-gray-400 mb-2">
          Чтобы сорвать Bad Beat Jackpot, необходимо выполнить следующие условия:
        </p>
        <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5 mb-7">
          {QUALIFY_CONDITIONS.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>

        {/* Выплаты */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">Выплаты Bad Beat Jackpot</h2>
        <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5 mb-4">
          <li>Джекпот будет начислен непосредственно на ваш баланс.</li>
          <li>
            Комиссия, указанная в таблице, вычитается из подходящих банков, которые достигают или превышают
            10 больших блайндов (ББ) для NLH и 10 анте для Short Deck.
          </li>
        </ul>

        {/* Таблица выплат (read-only) */}
        <div className="rounded-2xl border border-white/10 overflow-hidden text-xs">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2 bg-gray-800 font-bold text-gray-400">
            <span>Блайнды</span>
            <span className="text-right">Дроп</span>
            <span className="text-right">Поб.</span>
            <span className="text-right">Прот.</span>
            <span className="text-right">Ост.</span>
          </div>
          {tiers.map((t) => (
            <div
              key={t.blinds}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2.5 border-t border-white/5 items-center"
            >
              <span className="text-gray-300 leading-tight">{t.blinds}</span>
              <span className="text-right text-white tabular-nums">{fmt2(t.bb)} ББ</span>
              <span className="text-right text-emerald-300 tabular-nums">{fmt2(t.win)}%</span>
              <span className="text-right text-amber-300 tabular-nums">{fmt2(t.opp)}%</span>
              <span className="text-right text-gray-300 tabular-nums">{fmt2(t.oth)}%</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-3">
          Поб. — бэд-бит победитель, Прот. — бэд-бит противник, Ост. — остальные игроки (1/n). Проценты —
          доля пула джекпота.
        </p>
      </div>
    </div>
  );
};

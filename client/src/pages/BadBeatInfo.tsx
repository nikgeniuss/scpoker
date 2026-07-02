import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { BadBeatLogo } from '../components/admin/BadBeatLogo';
import { useBadBeatStore } from '../store/badBeatStore';
import { formatMoney } from '../config/chipFormat';
import { TIER_DEFAULTS } from '../config/badBeat';

// Игрок-view «Бэд-Бит Джекпот» (экран 1 эталона) — read-only для всех игроков (RequireAuth).
// Пул берём из badBeatStore (пока local; с серверной логикой станет реальным). Таблица — из
// общего конфига badBeat.ts, условия — из i18n (badBeatInfo.qualifyConditions). Форматы: NLH + Short Deck.

// Локальный аналог fmt2 из config/badBeat.ts с разделителем по языку (там — фиксированная запятая для админки).
const fmtPct = (n: number, lang: string) => n.toFixed(2).replace('.', lang === 'en' ? '.' : ',');

export const BadBeatInfo = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pool = useBadBeatStore((s) => s.pool);
  const storeTiers = useBadBeatStore((s) => s.tiers);
  const loadPublic = useBadBeatStore((s) => s.loadPublic);
  const tiers = storeTiers.length ? storeTiers : TIER_DEFAULTS;
  const qualifyConditions = t('badBeatInfo.qualifyConditions', { returnObjects: true }) as string[];

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
            aria-label={t('badBeatInfo.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('badBeatInfo.title')}</h1>
        </div>

        {/* Баннер с суммой пула */}
        <div className="relative rounded-2xl overflow-hidden mb-6 h-24 flex items-center justify-between px-5 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-white/10">
          <BadBeatLogo className="h-20" />
          <span className="text-4xl font-black tabular-nums italic text-white/90">{formatMoney(pool)}</span>
        </div>

        {/* Условия */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">{t('badBeatInfo.qualifyTitle')}</h2>
        <p className="text-sm text-gray-400 mb-2">
          {t('badBeatInfo.qualifyIntro')}
        </p>
        <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5 mb-7">
          {qualifyConditions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>

        {/* Выплаты */}
        <h2 className="text-sm font-bold text-emerald-400 mb-2">{t('badBeatInfo.payoutsTitle')}</h2>
        <ul className="text-sm text-gray-400 space-y-2 list-disc pl-5 mb-4">
          <li>{t('badBeatInfo.payoutDirect')}</li>
          <li>
            {t('badBeatInfo.payoutCommission')}
          </li>
        </ul>

        {/* Таблица выплат (read-only) */}
        <div className="rounded-2xl border border-white/10 overflow-hidden text-xs">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2 bg-gray-800 font-bold text-gray-400">
            <span>{t('badBeatInfo.colBlinds')}</span>
            <span className="text-right">{t('badBeatInfo.colDrop')}</span>
            <span className="text-right">{t('badBeatInfo.colWinner')}</span>
            <span className="text-right">{t('badBeatInfo.colOpponent')}</span>
            <span className="text-right">{t('badBeatInfo.colOthers')}</span>
          </div>
          {tiers.map((tier) => (
            <div
              key={tier.blinds}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-1 px-2 py-2.5 border-t border-white/5 items-center"
            >
              <span className="text-gray-300 leading-tight">{tier.blinds}</span>
              <span className="text-right text-white tabular-nums">{fmtPct(tier.bb, i18n.language)} {t('badBeatInfo.bbAbbrev')}</span>
              <span className="text-right text-emerald-300 tabular-nums">{fmtPct(tier.win, i18n.language)}%</span>
              <span className="text-right text-amber-300 tabular-nums">{fmtPct(tier.opp, i18n.language)}%</span>
              <span className="text-right text-gray-300 tabular-nums">{fmtPct(tier.oth, i18n.language)}%</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-3">
          {t('badBeatInfo.footnote')}
        </p>
      </div>
    </div>
  );
};

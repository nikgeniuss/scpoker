import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown } from 'lucide-react';

export function Help() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // FAQ — упрощённое player-facing изложение POKER_RULES.md (i18n: help.faq в locales/*.ts).
  const FAQ_ITEMS = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
    <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('help.title')}</span>
      </div>

      <div className="flex-1 px-4 pb-10">
        <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm font-medium">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={'text-white/40 flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
                  />
                </button>
                {open && (
                  <div className="px-4 pb-3.5 -mt-1 text-sm text-white/60 leading-relaxed">{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}

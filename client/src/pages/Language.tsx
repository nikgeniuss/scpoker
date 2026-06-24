import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Check } from 'lucide-react';
import { saveLang } from '../i18n';
import type { Lang } from '../i18n';

const LANGS: { code: Lang; labelKey: 'language.russian' | 'language.english' }[] = [
  { code: 'ru', labelKey: 'language.russian' },
  { code: 'en', labelKey: 'language.english' },
];

export function Language() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const select = (code: Lang) => {
    i18n.changeLanguage(code);
    saveLang(code);
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('language.title')}</span>
      </div>

      <div className="flex-1 px-4">
        <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => select(l.code)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
            >
              <span className="text-sm font-medium">{t(l.labelKey)}</span>
              {i18n.language === l.code && <Check size={18} className="text-emerald-400" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

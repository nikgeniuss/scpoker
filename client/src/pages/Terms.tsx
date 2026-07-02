import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';

// Пользовательское соглашение (ROADMAP §11.2). ПЛЕЙСХОЛДЕР — реальный юридический текст
// должен подготовить юрист/специалист по комплаенсу под конкретную юрисдикцию лицензирования,
// это НЕ задача для авто-генерации кодом. Публичный роут (доступен и без логина — со страницы
// регистрации), поэтому без RequireAuth.
export const Terms = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('legal.termsTitle')}</h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-amber-300 text-sm">
          {t('legal.placeholderNotice')}
        </div>

        <div className="space-y-4 text-white/70 text-sm leading-relaxed">
          <p>{t('legal.termsPlaceholderBody')}</p>
        </div>
      </div>
    </div>
  );
};

export default Terms;

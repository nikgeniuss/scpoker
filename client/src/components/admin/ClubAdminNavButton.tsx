import { Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Кнопка-вход в «Администратор Клуба» из navbar (Layout). Lazy — грузится только для админа,
// код не попадает в бандл игрока. Реальная защита данных — серверный adminMiddleware на /api/admin/*.
export default function ClubAdminNavButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t('nav.clubAdmin')}
      className="flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-white/10 text-white text-sm font-bold"
    >
      <Crown size={16} className="md:hidden" />
      <span className="hidden md:inline">{t('nav.club')}</span>
    </button>
  );
}

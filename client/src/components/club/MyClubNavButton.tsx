import { Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MyClubNavButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t('nav.myClub')}
      className="flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-bold"
    >
      <Crown size={16} className="md:hidden" />
      <span className="hidden md:inline">{t('nav.myClub')}</span>
    </button>
  );
}

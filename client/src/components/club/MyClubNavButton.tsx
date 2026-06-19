import { Crown } from 'lucide-react';

export default function MyClubNavButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Мой клуб"
      className="flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-bold"
    >
      <Crown size={16} className="md:hidden" />
      <span className="hidden md:inline">Мой клуб</span>
    </button>
  );
}

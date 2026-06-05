import { Shield } from 'lucide-react';

// Кнопка-навигация в админку из общего navbar (Layout). Lazy — грузится только для админа,
// код не попадает в бандл игрока. Серверная защита /api/admin/* (adminMiddleware) — обязательна.
export default function AdminNavButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Админ-панель"
      className="flex items-center justify-center w-9 h-9 md:h-auto md:w-auto md:px-3 md:py-1 rounded-lg bg-poker-gold text-black text-sm font-bold"
    >
      <Shield size={16} className="md:hidden" />
      <span className="hidden md:inline">Админ-панель</span>
    </button>
  );
}

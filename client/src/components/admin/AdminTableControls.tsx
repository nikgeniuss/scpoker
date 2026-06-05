import { Shield, Eye, EyeOff } from 'lucide-react';
import { getSocket } from '../../lib/socket';
import { SOCKET_EVENTS } from '@poker-room/shared';

// Админ-кнопки за игровым столом (shield → /admin, глаз → admin-peek). Вынесены в отдельный
// модуль и грузятся lazy ТОЛЬКО для админа — код (включая emit ADMIN_PEEK_TOGGLE) не попадает
// в основной бандл игрока. Серверная проверка роли (adminPeekToggle/role) — обязательна.
interface AdminTableControlsProps {
  slot: 'nav' | 'peek';
  onOpenAdmin?: () => void;            // slot='nav'
  roomId?: string;                     // slot='peek'
  peekOn?: boolean;
  setPeekOn?: (v: boolean) => void;
}

export default function AdminTableControls({ slot, onOpenAdmin, roomId, peekOn, setPeekOn }: AdminTableControlsProps) {
  if (slot === 'nav') {
    return (
      <button
        onClick={onOpenAdmin}
        title="Админ-панель"
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-poker-gold text-black"
      >
        <Shield size={16} />
      </button>
    );
  }

  // slot === 'peek': переключаем и сразу шлём на сервер (сервер ответит свежим gameUpdate).
  const togglePeek = () => {
    if (!roomId || !setPeekOn) return;
    const next = !peekOn;
    setPeekOn(next);
    getSocket().emit(SOCKET_EVENTS.ADMIN_PEEK_TOGGLE, { enabled: next, roomId });
  };

  return (
    <button
      onClick={togglePeek}
      title={peekOn ? 'Выключить глаз админа' : 'Включить глаз админа (показать все карты)'}
      className={
        'flex items-center justify-center w-9 h-9 rounded-xl border ' +
        (peekOn
          ? 'bg-red-600/80 hover:bg-red-700 text-white border-red-900 animate-pulse'
          : 'bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border-white/10')
      }
    >
      {peekOn ? <Eye size={16} /> : <EyeOff size={16} />}
    </button>
  );
}

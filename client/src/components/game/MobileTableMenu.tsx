import { lazy, Suspense, useState } from 'react';
import { Info, Smile, Settings, LogOut, Coins, Menu } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';

// Админ-кнопки — lazy-чанк (код не в бандле игрока, §0.12). Рендерятся только при isAdmin.
const AdminTableControls = lazy(() => import('../admin/AdminTableControls'));

interface MobileTableMenuProps {
  userChips?: number;
  isAdmin: boolean;
  roomId?: string;
  peekOn: boolean;
  setPeekOn: (v: boolean) => void;
  onOpenAdmin: () => void;
  onOpenInfo: () => void;
  onToggleEmoji: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  hideTrigger?: boolean; // прячем кнопку-вызов (напр. когда раскрыт блок рейза), чтобы не мешала
}

// Нижнее меню стола для mobile/TWA: верхний бар спрятан, его кнопки (баланс, админ, инфо,
// peek, реакции, настройки, выход) уезжают в нижнюю выезжающую панель.
// Вызов — компактной кнопкой-меню в правом нижнем углу (над кнопками хода), доступна в любой
// момент; скрытие — тап по фону, по грипу или по выбранному действию. Только mobile (md:hidden).
export const MobileTableMenu = ({
  userChips,
  isAdmin,
  roomId,
  peekOn,
  setPeekOn,
  onOpenAdmin,
  onOpenInfo,
  onToggleEmoji,
  onOpenSettings,
  onLeave,
  hideTrigger,
}: MobileTableMenuProps) => {
  const [open, setOpen] = useState(false);

  // Действие из меню закрывает панель.
  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const btn =
    'flex items-center justify-center w-11 h-11 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10';

  return (
    <div className="md:hidden">
      {/* Затемнение — тап закрывает */}
      {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />}

      {/* Выезжающая нижняя панель */}
      <div
        className={
          'fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ' +
          (open ? 'translate-y-0' : 'translate-y-full')
        }
      >
        <div className="mx-auto max-w-md bg-black/85 backdrop-blur-md rounded-t-2xl border border-b-0 border-white/10 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)]">
          {/* Грип — тап закрывает */}
          <div className="flex justify-center py-3 cursor-pointer" onClick={() => setOpen(false)}>
            <div className="h-1.5 w-12 rounded-full bg-white/30" />
          </div>
          <div className="flex items-center justify-center gap-2.5 flex-wrap pb-1">
            {typeof userChips === 'number' && (
              <span
                title="Свободный банкролл"
                className="inline-flex items-center gap-1 px-2.5 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold whitespace-nowrap"
              >
                <Coins size={14} /> {formatMoney(userChips)}
              </span>
            )}
            {isAdmin && (
              <Suspense fallback={null}>
                <AdminTableControls slot="nav" onOpenAdmin={act(onOpenAdmin)} />
              </Suspense>
            )}
            <button onClick={act(onOpenInfo)} title="Информация о столе" className={btn}>
              <Info size={18} />
            </button>
            {isAdmin && (
              <Suspense fallback={null}>
                <AdminTableControls slot="peek" roomId={roomId} peekOn={peekOn} setPeekOn={setPeekOn} />
              </Suspense>
            )}
            <button onClick={act(onToggleEmoji)} title="Реакции" className={btn}>
              <Smile size={18} />
            </button>
            <button onClick={act(onOpenSettings)} title="Настройки игры" className={btn}>
              <Settings size={18} />
            </button>
            <button
              onClick={act(onLeave)}
              title="Выйти за стол (в лобби)"
              className={
                'flex items-center justify-center w-11 h-11 rounded-xl bg-red-600/80 hover:bg-red-700 text-white border border-red-500/40'
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Кнопка-вызов меню: правый нижний угол, над кнопками хода. Компактная, иконка-меню
          интуитивна. Доступна в любой момент (и на своём ходу). Прячется пока меню открыто
          или когда раскрыт блок рейза (hideTrigger), чтобы не мешать. */}
      {!open && !hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Меню стола"
          title="Меню стола"
          className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white/85 active:text-white shadow-lg shadow-black/40"
        >
          <Menu size={20} />
        </button>
      )}
    </div>
  );
};

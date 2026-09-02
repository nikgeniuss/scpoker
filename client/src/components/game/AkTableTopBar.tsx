import { Info, History, Settings } from 'lucide-react';

interface AkTableTopBarProps {
  onOpenInfo: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

// Верхняя панель иконок AK-стола (референс AK Poker) — только под akTableEnabled.
// Все иконки — одним рядом top-right (Инфо перенесена сюда из top-left, 2026-08-23: там
// дублировалась/накладывалась с бургер-триггером MobileTableMenu).
// Бургер-меню (top-left в референсе) не дублируется здесь: рисуется самим MobileTableMenu
// через проп topLeftTrigger (стейт open остаётся внутри него).
// "Инфо" → TableInfoModal (ближайший смысловой аналог, инфо о столе).
// Пинг из референса не показываем — в приложении нет замера latency.
// Трастовый щит-бейдж (декоративный, из референса) убран (2026-08-23, по просьбе пользователя).
// admin-peek остаётся в MobileTableMenu, не выносится отдельной постоянной иконкой (§0.13).
export const AkTableTopBar = ({ onOpenInfo, onOpenHistory, onOpenSettings }: AkTableTopBarProps) => {
  const btn =
    'relative overflow-hidden w-9 h-9 bg-black/40 rounded flex items-center justify-center border border-white/10 text-white ' +
    "before:content-[''] before:absolute before:inset-x-0.5 before:top-0.5 before:h-1/2 before:rounded-t before:bg-gradient-to-b before:from-white/40 before:to-transparent before:pointer-events-none";

  return (
    <div className="md:hidden">
      <div className="fixed top-3 right-4 z-40 flex items-center gap-2">
        <div className="relative left-[12px] flex items-center gap-2">
          <button type="button" onClick={onOpenInfo} className={btn} aria-label="Информация о столе">
            <Info size={18} />
          </button>
          <button type="button" onClick={onOpenHistory} className={btn} aria-label="История рук">
            <History size={18} />
          </button>
          <button type="button" onClick={onOpenSettings} className={btn} aria-label="Настройки">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

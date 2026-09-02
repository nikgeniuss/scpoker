// AK-скин «Акция» ("/ak-promotions") — новый чисто визуальный промо-центр по референсу AK Poker.
// Реального бэкенда/API под акции нет и не выдумывается — все карточки статичные заглушки прямо
// здесь. Вкладка «Задание» и категории слева (таб-фильтр) — визуальные, без отдельного контента.

import { useState } from 'react';
import { Gift } from 'lucide-react';

// Статичное описание одной промо-карточки — вместо растрового баннера рисуем CSS-градиентом.
interface Promotion {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  dateRange: string;
  gradient: string;
  cta: string;
  hot?: boolean;
}

const PROMOTIONS: Promotion[] = [
  {
    id: 'invite',
    title: 'ПРИГЛАШАЙ И ЗАРАБАТЫВАЙ',
    subtitle: 'Приводи друзей за стол — получай бонус за каждого',
    emoji: '🤝',
    dateRange: '06.09.2025 – 06.09.2031',
    gradient: 'from-orange-500 via-red-500 to-red-700',
    cta: 'Забрать',
    hot: true,
  },
  {
    id: 'wheel',
    title: 'КОЛЕСО ФОРТУНЫ',
    subtitle: 'Крути колесо каждый день и получай призы',
    emoji: '🎡',
    dateRange: '29.06.2026 – 29.09.2026',
    gradient: 'from-indigo-500 via-purple-600 to-blue-700',
    cta: 'Крутить',
  },
  {
    id: 'first-deposit',
    title: 'ПОДАРОК ЗА ПЕРВЫЙ ДЕПОЗИТ',
    subtitle: 'Забери бонус до $3,688 на первое пополнение',
    emoji: '🎁',
    dateRange: '17.06.2026 – 17.09.2026',
    gradient: 'from-amber-400 via-yellow-500 to-orange-600',
    cta: 'Подробнее',
  },
  {
    id: 'cashback',
    title: 'ЕЖЕНЕДЕЛЬНЫЙ КЭШБЭК',
    subtitle: 'Возврат части проигрыша каждый понедельник',
    emoji: '💰',
    dateRange: '01.01.2026 – 31.12.2026',
    gradient: 'from-teal-500 via-emerald-600 to-green-700',
    cta: 'Забрать',
  },
];

// Категории слева — чисто визуальный фильтр (переключение локальным state, без реальной
// разбивки промо-акций по категориям, т.к. под это нет данных).
const CATEGORIES = ['Покер', 'Казино', 'Турниры', 'VIP'];

const PromoCard = ({ promo }: { promo: Promotion }) => (
  <div className="rounded-[13px] overflow-hidden shadow-lg">
    <div className={'relative flex flex-col px-4 py-4 min-h-[150px] bg-gradient-to-br ' + promo.gradient}>
      {promo.hot && (
        <span className="absolute top-2.5 right-2.5 bg-ak-red text-white text-[10px] font-bold px-2 py-0.5 rounded-[5px] tracking-wide">
          HOT
        </span>
      )}
      <div className="text-4xl leading-none drop-shadow-sm">{promo.emoji}</div>
      <div className="mt-2 text-white font-extrabold text-base sm:text-lg leading-tight drop-shadow-sm break-words">
        {promo.title}
      </div>
      <div className="text-white/80 text-xs mt-1 break-words">{promo.subtitle}</div>
      <button className="mt-auto self-start inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-ak-gold text-ak-navy text-sm font-bold shadow-md active:scale-95 transition-transform">
        {promo.cta}
      </button>
    </div>
    <div className="px-4 py-2 text-[11px] text-white/50 bg-black/10">
      Период: {promo.dateRange}
    </div>
  </div>
);

export const AkPromotions = () => {
  // Таб «Акция»/«Задание» — визуальный, под «Задание» реального контента нет (заглушка «Скоро»).
  const [activeTab, setActiveTab] = useState<'promo' | 'task'>('promo');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  return (
    <div className="ak-font min-h-[100dvh] bg-ak-navy flex flex-col">
      {/* Локальный заголовок страницы (не chrome — тот уже отрисован в AkChrome/Layout) */}
      <div className="px-4 pt-5 pb-3 text-center shrink-0">
        <h1 className="flex items-center justify-center gap-2 text-white text-base sm:text-lg font-bold tracking-wide">
          <Gift size={18} className="text-ak-gold" />
          Центр акций
        </h1>
      </div>

      {/* Табы */}
      <div className="flex px-4 gap-6 border-b border-white/10 shrink-0">
        <button
          onClick={() => setActiveTab('promo')}
          className={
            'min-h-[44px] px-1 text-sm font-bold border-b-2 transition-colors ' +
            (activeTab === 'promo' ? 'text-ak-gold border-ak-gold' : 'text-white/40 border-transparent')
          }
        >
          Акция
        </button>
        <button
          onClick={() => setActiveTab('task')}
          className={
            'min-h-[44px] px-1 text-sm font-bold border-b-2 transition-colors ' +
            (activeTab === 'task' ? 'text-ak-gold border-ak-gold' : 'text-white/40 border-transparent')
          }
        >
          Задание
        </button>
      </div>

      {activeTab === 'promo' ? (
        <div className="flex flex-1">
          {/* Колонка категорий-фильтров — чисто визуальная */}
          <div className="w-[88px] sm:w-28 shrink-0 bg-black/20 flex flex-col py-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={
                  'min-h-[44px] px-2 py-2.5 text-xs font-bold text-center transition-colors border-l-2 ' +
                  (activeCategory === cat ? 'text-ak-gold border-ak-gold bg-white/5' : 'text-white/40 border-transparent')
                }
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Список промо-баннеров */}
          <div className="flex-1 min-w-0 p-3 flex flex-col gap-3">
            {PROMOTIONS.map((promo) => (
              <PromoCard key={promo.id} promo={promo} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
          <div className="text-4xl">🛠️</div>
          <div className="text-white/60 text-sm">Задания скоро появятся</div>
        </div>
      )}
    </div>
  );
};

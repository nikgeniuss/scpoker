import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ChevronLeft,
  ChevronRight,
  Box,
  History,
  BarChart3,
  ScrollText,
  Briefcase,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAdminApi } from '../hooks/useAdminApi';
import { formatMoney, loadChipDisplay } from '../config/chipFormat';
import { loadCardDeck } from '../config/cardDeck';
import { DEFAULT_DESIGN } from '../config/design';
import { HandHistoryModal } from '../components/game/HandHistoryModal';

// Экран «Администратор Клуба» — admin-only (lazy-чанк за RequireAdmin, см. §0.12).
// Читает уже защищённые adminMiddleware эндпоинты /admin/stats/overview и /admin/users.
// Форматы: только NLH + Шорт-дэк (memory game-formats). Статистика пока суммарная —
// трекинг не разбит по форматам; Игры/Страховка/EV Cashout в проекте не считаются (показываем «—»).

interface Overview {
  games: number;
  rake: number;
}

const FORMATS = [
  { id: 'nlh', label: 'NLH' },
  { id: 'short', label: 'Шорт-дэк' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const ClubAdmin = () => {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const api = useAdminApi(token);

  const [format, setFormat] = useState('nlh');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Сводка за всё время (без from/to). Дата создания клуба = самая ранняя регистрация в системе.
  useEffect(() => {
    let alive = true;
    api
      .get<Overview>('/admin/stats/overview')
      .then((o) => alive && setOverview(o))
      .catch(() => alive && setOverview(null));
    api
      .get<Array<{ createdAt: string }>>('/admin/users')
      .then((users) => {
        if (!alive || !users.length) return;
        const earliest = users.reduce((min, u) => (u.createdAt < min ? u.createdAt : min), users[0].createdAt);
        setCreatedAt(ymd(new Date(earliest)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);

  const activeLabel = FORMATS.find((f) => f.id === format)?.label ?? '';
  const soon = () => toast('В разработке', { icon: '🛠️' });

  const menu = [
    { icon: Box, label: 'PokerCraft', onClick: () => navigate('/pokercraft') },
    { icon: History, label: 'История рук', onClick: () => setHistoryOpen(true) },
    { icon: BarChart3, label: 'Данные Игры', onClick: () => navigate('/admin') },
    { icon: ScrollText, label: 'История присвоения членства', onClick: soon },
    { icon: Briefcase, label: 'Карьера', onClick: soon },
    { icon: Sparkles, label: 'Бэд-бит Джекпот', onClick: () => navigate('/club-admin/bad-beat') },
    { icon: Trophy, label: 'Таблица лидеров', onClick: () => navigate('/club-admin/leaderboard') },
  ];

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-6">
          <button
            onClick={() => navigate('/lobby')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">Администратор Клуба</h1>
        </div>

        {/* Дата создания клуба */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-400">Дата создания клуба</span>
          <span className="text-sm font-semibold tabular-nums">{createdAt ?? '…'}</span>
        </div>

        {/* Вкладки форматов */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-900 border border-white/10 mb-4">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={
                'py-2.5 rounded-xl text-sm font-bold transition-all ' +
                (format === f.id ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Карточка статистики */}
        <div className="rounded-2xl bg-gray-900 border border-white/10 p-4 mb-6">
          <div className="text-lg font-bold text-emerald-400 mb-3">{activeLabel}</div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-3">
            <Stat label="Игры" value="—" />
            <Stat label="Раздачи" value={overview ? String(overview.games) : '…'} />
            <Stat label="Страховка" value="—" />
            <Stat label="EV Cashout" value="—" />
            <Stat label="Рейк" value={overview ? formatMoney(overview.rake) : '…'} />
          </div>
          <p className="text-[10px] text-gray-600 mt-4">
            Статистика суммарная по клубу. Разбивка по форматам и метрики «Игры / Страховка / EV Cashout»
            появятся позже.
          </p>
        </div>

        {/* Список разделов */}
        <div className="rounded-2xl bg-gray-900 border border-white/10 overflow-hidden">
          {menu.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.button
                key={m.label}
                whileTap={{ scale: 0.99 }}
                onClick={m.onClick}
                className={
                  'w-full flex items-center gap-3 px-4 min-h-[56px] text-left transition-colors hover:bg-white/5 ' +
                  (i > 0 ? 'border-t border-white/5' : '')
                }
              >
                <Icon size={20} className="shrink-0 text-gray-300" />
                <span className="flex-1 text-sm font-medium">{m.label}</span>
                <ChevronRight size={18} className="shrink-0 text-gray-500" />
              </motion.button>
            );
          })}
        </div>
      </div>

      <HandHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        myId={user?.id ?? null}
        chipDisplay={loadChipDisplay()}
        cardDeck={loadCardDeck()}
        cardBackStyle={DEFAULT_DESIGN.cardBackStyle}
        title="История рук"
      />
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs text-gray-500 mb-0.5">{label}</span>
    <span className="text-lg font-bold tabular-nums">{value}</span>
  </div>
);

import { useState } from 'react';
import { Users, Dices, Trophy, Flame, Crown, Eye, Lock, TrendingUp } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../utils/avatar';

// ВРЕМЕННАЯ страница — тестовый редизайн лобби под топ-румы (GGPoker/ClubGG).
// Маршрут /redesign-preview. Статичный mockup, фейковые данные, никакой реальной логики.
// Стол НЕ редизайнится здесь — фетр уже в GG-стиле (theme-clubgg, см. index.css).
// Цель — визуально сравнить с текущим Lobby.tsx и решить, переносить ли элементы.
// Можно удалить после сверки.

interface MockRoom {
  id: string;
  name: string;
  format: 'nlh' | 'shortdeck';
  sb: number;
  bb: number;
  players: number;
  maxPlayers: number;
  avgPot: number;
  handsPerHour: number;
  hasPassword: boolean;
  featured?: boolean;
  avatars: string[];
}

const ROOMS: MockRoom[] = [
  { id: '1', name: 'High Roller', format: 'nlh', sb: 500, bb: 1000, players: 7, maxPlayers: 9, avgPot: 18400, handsPerHour: 62, hasPassword: false, featured: true, avatars: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] },
  { id: '2', name: 'Изумруд', format: 'nlh', sb: 25, bb: 50, players: 6, maxPlayers: 9, avgPot: 940, handsPerHour: 58, hasPassword: false, avatars: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] },
  { id: '3', name: 'Шорт-дэк Арена', format: 'shortdeck', sb: 50, bb: 100, players: 5, maxPlayers: 6, avgPot: 2100, handsPerHour: 71, hasPassword: false, avatars: ['c1', 'c2', 'c3', 'c4', 'c5'] },
  { id: '4', name: 'Тихая гавань', format: 'nlh', sb: 5, bb: 10, players: 3, maxPlayers: 9, avgPot: 180, handsPerHour: 45, hasPassword: true, avatars: ['d1', 'd2', 'd3'] },
  { id: '5', name: 'Полночный стол', format: 'nlh', sb: 100, bb: 200, players: 9, maxPlayers: 9, avgPot: 4200, handsPerHour: 55, hasPassword: false, avatars: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'] },
];

const STAKE_FILTERS = ['Все', 'Микро', 'Низкие', 'Средние', 'Высокие'];

export function RedesignPreview() {
  const [format, setFormat] = useState<'all' | 'nlh' | 'shortdeck'>('all');
  const [stake, setStake] = useState(0);
  const [view, setView] = useState<'list' | 'grid'>('list');

  const rooms = ROOMS.filter((r) => format === 'all' || r.format === format);
  const featured = rooms.find((r) => r.featured);
  const rest = rooms.filter((r) => !r.featured);

  return (
    <div className="min-h-[100dvh] bg-[#070707] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="space-y-1">
          <h1 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Редизайн-превью (не влияет на прод)</h1>
          <p className="text-xs text-gray-500">/redesign-preview — статичный mockup лобби под топ-румы. Сравни с текущим /lobby.</p>
        </header>

        {/* Промо-баннер — как акция/джекпот в шапке GG/ClubGG лобби */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-[#1a1407] via-[#211a08] to-[#0f0d05] px-5 py-4 flex items-center gap-4">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <Crown size={22} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-amber-300">Bad Beat Jackpot — банк растёт</div>
            <div className="text-xs text-gray-400">Собери каре девяток и старше, чтобы забрать джекпот</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-black text-amber-300 tabular-nums">$48,210</div>
            <div className="flex gap-1 justify-end mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
            </div>
          </div>
        </div>

        {/* Тикер живой статистики */}
        <div className="flex flex-wrap items-center gap-2">
          <Stat icon={<Users size={12} />} label="онлайн" value="1,284" color="emerald" />
          <Stat icon={<Dices size={12} />} label="столов" value={String(rooms.length)} color="emerald" />
          <Stat icon={<TrendingUp size={12} />} label="раздач/час" value="312" color="emerald" />
          <Stat icon={<Flame size={12} />} label="крупнейший банк сегодня" value="$22,800" color="amber" />
          <button
            onClick={() => {}}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 border border-amber-500/40 text-amber-300 text-xs font-bold ml-auto"
          >
            <Trophy size={12} /> Лидеры
          </button>
        </div>

        {/* Сегмент-табы формата — единый трек с бегунком, GG-style */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
            {([
              { id: 'all', label: 'Все' },
              { id: 'nlh', label: 'NLH' },
              { id: 'shortdeck', label: 'Шорт-дэк' },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setFormat(t.id)}
                className={
                  'px-4 py-1.5 rounded-lg text-sm font-bold transition-all ' +
                  (format === t.id ? 'bg-emerald-500 text-black shadow' : 'text-gray-400 hover:text-white')
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 overflow-x-auto max-w-full">
            {STAKE_FILTERS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStake(i)}
                className={
                  'px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ' +
                  (stake === i
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10')
                }
              >
                {s}
              </button>
            ))}
          </div>

          <div className="ml-auto inline-flex p-1 rounded-xl bg-white/5 border border-white/10 shrink-0">
            <button
              onClick={() => setView('list')}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (view === 'list' ? 'bg-white/15 text-white' : 'text-gray-500')}
            >
              Список
            </button>
            <button
              onClick={() => setView('grid')}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (view === 'grid' ? 'bg-white/15 text-white' : 'text-gray-500')}
            >
              Карточки
            </button>
          </div>
        </div>

        {/* Featured-стол — крупная карточка с превью фетра, как «live table» в GG лобби */}
        {featured && <FeaturedRoom room={featured} />}

        {/* Список столов */}
        {view === 'list' ? (
          <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
            {rest.map((r) => (
              <RoomRow key={r.id} room={r} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rest.map((r) => (
              <RoomGridCard key={r.id} room={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'emerald' | 'amber' }) {
  const cls = color === 'amber' ? 'border-amber-500/40 text-amber-300' : 'border-emerald-500/40 text-emerald-300';
  return (
    <span className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 border text-xs font-bold ' + cls}>
      {icon} <span className="text-white/90">{value}</span> <span className="text-[10px] opacity-60 font-normal">{label}</span>
    </span>
  );
}

function money(cents: number): string {
  return (cents / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FeaturedRoom({ room }: { room: MockRoom }) {
  return (
    <div className="relative rounded-2xl border border-amber-500/40 bg-gradient-to-br from-[#15110a] via-[#0c0c0c] to-[#0a0a0a] p-5 flex items-center gap-5 overflow-hidden">
      {/* Мини-превью фетра */}
      <div className="hidden sm:block relative shrink-0 w-40 h-28 rounded-xl bg-[#0a3d1d] border-2 border-black/60 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #2d5934 0%, #1a3a22 60%, #0a1f11 100%)' }} />
        <div className="absolute inset-3 rounded-[50%] border border-white/10" />
        {room.avatars.slice(0, 6).map((seed, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return (
            <div
              key={seed}
              className="absolute w-4 h-4 rounded-full overflow-hidden ring-1 ring-black/40 -translate-x-1/2 -translate-y-1/2"
              style={{ left: 50 + 38 * Math.cos(angle) + '%', top: 50 + 38 * Math.sin(angle) + '%' }}
            >
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(seed)} />
            </div>
          );
        })}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider">VIP стол</span>
          <h3 className="text-xl font-black text-white">{room.name}</h3>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">NLH</span>
        </div>
        <div className="text-2xl font-black text-amber-300 tabular-nums mt-1">{money(room.sb)} / {money(room.bb)}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
          <span>{room.players}/{room.maxPlayers} игроков</span>
          <span>средний банк <b className="text-white">{money(room.avgPot)}</b></span>
          <span>{room.handsPerHour} раздач/час</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        <button className="px-5 py-2 rounded-xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-black hover:shadow-lg hover:shadow-amber-500/30 transition-all">
          Войти
        </button>
        <button className="px-5 py-1.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5">
          <Eye size={12} /> Наблюдать
        </button>
      </div>
    </div>
  );
}

function RoomRow({ room }: { room: MockRoom }) {
  const isFull = room.players >= room.maxPlayers;
  return (
    <div className="flex gap-3 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
      <div
        className={
          'w-1 self-stretch rounded-full shrink-0 ' +
          (room.format === 'shortdeck' ? 'bg-amber-500' : 'bg-emerald-500')
        }
      />

      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="w-24 sm:w-28 shrink-0">
          <div className="text-base font-black text-white tabular-nums">{money(room.sb)}/{money(room.bb)}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{room.format === 'shortdeck' ? 'Шорт-дэк' : 'NLH'}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white truncate">{room.name}</span>
            {room.hasPassword && <Lock size={12} className="text-amber-400 shrink-0" />}
          </div>
          <div className="text-[11px] text-gray-500 truncate">средний банк {money(room.avgPot)} · {room.handsPerHour} раздач/час</div>
        </div>

        <div className="hidden sm:flex items-center -space-x-1.5 shrink-0">
          {room.avatars.slice(0, 5).map((seed) => (
            <div key={seed} className="w-6 h-6 rounded-full overflow-hidden ring-2 ring-[#070707]">
              <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(seed)} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className={'text-sm font-bold tabular-nums shrink-0 ' + (isFull ? 'text-red-400' : 'text-emerald-400')}>
            {room.players}/{room.maxPlayers}
          </span>
          <button
            className={
              'shrink-0 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ' +
              (isFull
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30')
            }
          >
            {isFull ? 'Очередь' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomGridCard({ room }: { room: MockRoom }) {
  const isFull = room.players >= room.maxPlayers;
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-900/55 p-4 space-y-3 hover:border-emerald-500/40 transition-colors">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-white">{room.name}</h3>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{room.format === 'shortdeck' ? 'Шорт-дэк' : 'NLH'}</span>
        </div>
        <span className={'text-sm font-bold tabular-nums ' + (isFull ? 'text-red-400' : 'text-emerald-400')}>
          {room.players}/{room.maxPlayers}
        </span>
      </div>
      <div className="text-xl font-black text-amber-300 tabular-nums">{money(room.sb)} / {money(room.bb)}</div>
      <div className="text-[11px] text-gray-500">средний банк {money(room.avgPot)} · {room.handsPerHour} раздач/час</div>
      <div className="flex items-center -space-x-1.5">
        {room.avatars.slice(0, 6).map((seed) => (
          <div key={seed} className="w-6 h-6 rounded-full overflow-hidden ring-2 ring-gray-900">
            <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(seed)} />
          </div>
        ))}
      </div>
      <button
        className={
          'w-full py-2 rounded-xl font-bold transition-all ' +
          (isFull
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30')
        }
      >
        {isFull ? 'Занять очередь' : 'Войти'}
      </button>
    </div>
  );
}

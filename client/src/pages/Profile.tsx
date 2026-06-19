import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactNiceAvatar from 'react-nice-avatar';
import { AnimatePresence } from 'framer-motion';
import { ChevronRight, History, Settings2, Inbox, Globe, HelpCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { countryFlag } from '../utils/country';
import { formatMoney } from '../config/chipFormat';
import { avatarConfig } from '../utils/avatar';
import { AvatarPickerModal } from '../components/profile/AvatarPickerModal';
import { API_URL } from '../config/api';

const MENU_ITEMS = [
  { icon: <History size={20} />, label: 'PokerCraft', sub: 'История раздач · Банкролл', to: '/pokercraft' },
  { icon: <Settings2 size={20} />, label: 'Настройки игры', sub: null, to: null },
  { icon: <Inbox size={20} />, label: 'Входящие', sub: null, to: '/inbox' },
  { icon: <Globe size={20} />, label: 'Язык', sub: null, to: null },
  { icon: <HelpCircle size={20} />, label: 'Помощь', sub: null, to: null },
];

export function Profile() {
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const setAvatarSeed = useAuthStore(s => s.setAvatarSeed);
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!user) return null;

  const flag = countryFlag(user.country);

  const pickAvatar = async (seed: string) => {
    setAvatarSeed(seed);
    setPickerOpen(false);
    try {
      await fetch(`${API_URL}/auth/avatar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed }),
      });
    } catch { /* noop */ }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">Профиль</span>
      </div>

      {/* Avatar + info */}
      <div className="flex flex-col items-center gap-3 pb-8">
        <button
          className="w-20 h-20 rounded-full shadow-lg overflow-hidden"
          onClick={() => setPickerOpen(true)}
          title="Сменить аватар"
        >
          <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(user.avatarSeed || user.id)} />
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{user.username}</span>
            {flag && <span className="text-xl" title={user.country ?? ''}>{flag}</span>}
          </div>
          {user.publicId && (
            <span className="text-white/40 text-sm font-mono tracking-wider">{user.publicId}</span>
          )}
          <div className="mt-1 px-4 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-bold">
            {formatMoney(user.chips ?? 0)}
          </div>
        </div>

        <button
          className="mt-2 px-6 py-2 rounded-full border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors"
          onClick={() => {}}
        >
          Данные Аккаунта
        </button>
      </div>

      {/* Menu */}
      <div className="flex-1 px-4">
        <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
              onClick={() => item.to && navigate(item.to)}
            >
              <span className="text-white/40">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                {item.sub && <div className="text-xs text-white/30">{item.sub}</div>}
              </div>
              <ChevronRight size={16} className="text-white/20 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <div className="pb-24" />

      <AnimatePresence>
        {pickerOpen && (
          <AvatarPickerModal
            currentSeed={user.avatarSeed || user.id}
            onClose={() => setPickerOpen(false)}
            onPick={pickAvatar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

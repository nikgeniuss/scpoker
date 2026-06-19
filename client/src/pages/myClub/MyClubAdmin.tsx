import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Users, Settings } from 'lucide-react';
import { useMyClub } from '../../hooks/useMyClub';
import { MembersTab } from './MembersTab';
import { SettingsTab } from './SettingsTab';

const TABS = [
  { id: 'members', label: 'Участники', Icon: Users },
  { id: 'settings', label: 'Настройки', Icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

export const MyClubAdmin = () => {
  const navigate = useNavigate();
  const { myClub, refresh } = useMyClub();
  const [tab, setTab] = useState<TabId>('members');

  // myClub guaranteed non-null здесь (RequireClubOwner проверил выше)
  if (!myClub) return null;

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-6">
          <button
            onClick={() => navigate('/')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={26} />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold truncate max-w-[200px]">{myClub.name}</h1>
            <p className="text-[10px] text-emerald-400 uppercase tracking-wide mt-0.5">Мой клуб</p>
          </div>
        </div>

        {/* Табы */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-900 border border-white/10 mb-6">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ' +
                (tab === id ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              <Icon size={15} />
              {label}
              {id === 'members' && myClub.pendingRequests.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black leading-none">
                  {myClub.pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Контент */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'members' && <MembersTab club={myClub} onRefresh={refresh} />}
          {tab === 'settings' && <SettingsTab club={myClub} onRefresh={refresh} />}
        </motion.div>
      </div>
    </div>
  );
};

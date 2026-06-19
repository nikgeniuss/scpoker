import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { DataTab } from './admin/DataTab';
import { DesignTab } from './admin/DesignTab';
import { PlayersTab } from './admin/PlayersTab';
import { ChipsTab } from './admin/ChipsTab';
import { RoomsTab } from './admin/RoomsTab';
import { BotsTab } from './admin/BotsTab';
import { SettingsTab } from './admin/SettingsTab';
import { PaidFeaturesTab } from './admin/PaidFeaturesTab';

const tabs = [
  { id: 'data', label: '📊 Данные' },
  { id: 'design', label: '🎨 Дизайн' },
  { id: 'players', label: '👥 Игроки' },
  { id: 'chips', label: '💰 Фишки' },
  { id: 'rooms', label: '🎮 Комнаты' },
  { id: 'bots', label: '🧠 Боты' },
  { id: 'settings', label: '⚙️ Настройки' },
  { id: 'paidFeatures', label: '💎 Платные фичи' },
];

export const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();
  const [activeTab, setActiveTab] = useState('data');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? '';

  useEffect(() => {
    if (!isAdmin) navigate('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="min-h-[100dvh] bg-gray-900 flex flex-col md:flex-row">
      {/* Mobile top bar с burger */}
      <div className="md:hidden flex items-center justify-between bg-gray-800 px-4 py-3 border-b border-white/10 sticky top-0 z-30">
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Открыть меню"
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
        >
          ☰
        </button>
        <div className="text-sm font-bold text-poker-gold truncate">{activeTabLabel}</div>
        <div className="w-11" />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-gray-800 p-5 flex flex-col gap-2 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-poker-gold">Админ-панель</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Закрыть меню"
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
                >
                  ✕
                </button>
              </div>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={
                    'text-left px-4 py-3 rounded-xl transition-all min-h-[44px] ' +
                    (activeTab === tab.id
                      ? 'bg-poker-gold text-black font-bold'
                      : 'text-gray-300 hover:bg-gray-700')
                  }
                >
                  {tab.label}
                </button>
              ))}
              <button
                onClick={() => navigate('/lobby')}
                className="mt-4 text-left px-4 py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold min-h-[44px]"
              >
                ← В лобби
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.div
        initial={{ x: -200, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex w-64 bg-gray-800 p-6 flex-col gap-2"
      >
        <h2 className="text-xl font-bold text-poker-gold mb-6">Админ-панель</h2>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              'text-left px-4 py-3 rounded-xl transition-all ' +
              (activeTab === tab.id ? 'bg-poker-gold text-black font-bold' : 'text-gray-400 hover:bg-gray-700')
            }
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => navigate('/lobby')}
          className="mt-auto text-left px-4 py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold"
        >
          ← В лобби
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-1 p-4 md:p-8 overflow-y-auto"
      >
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'design' && <DesignTab />}
        {activeTab === 'players' && <PlayersTab />}
        {activeTab === 'chips' && <ChipsTab />}
        {activeTab === 'rooms' && <RoomsTab />}
        {activeTab === 'bots' && <BotsTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'paidFeatures' && <PaidFeaturesTab />}
      </motion.div>
    </div>
  );
};

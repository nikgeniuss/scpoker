import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Key, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import { OpenClubsList } from './OpenClubsList';

interface Props {
  onClose: () => void;
  onJoined: () => void;
}

type Tab = 'code' | 'search';

export const JoinClubModal = ({ onClose, onJoined }: Props) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>('code');

  // Вкладка «По коду»
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const joinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setCodeLoading(true);
    try {
      const r = await fetch(`${API_URL}/clubs/join/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error === 'invalid-code' ? t('joinClubModal.invalidCode')
                  : data.error === 'already-member' ? t('joinClubModal.alreadyMember') : t('joinClubModal.error');
        toast.error(msg);
        return;
      }
      toast.success(t('joinClubModal.joined', { name: data.name }));
      onJoined();
    } catch {
      toast.error(t('joinClubModal.networkError'));
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f0f0f] w-full md:max-w-sm rounded-t-3xl md:rounded-3xl border-t border-white/10 md:border overflow-hidden"
      >
        {/* Шапка */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-white"
          >
            <ChevronLeft size={22} />
          </button>
          <h3 className="text-base font-bold text-white">{t('joinClubModal.title')}</h3>
        </div>

        {/* Табы */}
        <div className="grid grid-cols-2 gap-1 px-5 pb-4">
          {([
            { id: 'code', label: t('joinClubModal.tabByCode'), Icon: Key },
            { id: 'search', label: t('joinClubModal.tabFindClub'), Icon: Search },
          ] as { id: Tab; label: string; Icon: typeof Key }[]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                'flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ' +
                (tab === id ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white')
              }
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 pb-7">
          {tab === 'code' ? (
            <form onSubmit={joinByCode} className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">{t('joinClubModal.codeHint')}</p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="XXXXXXXX"
                autoFocus
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-mono text-xl tracking-[0.3em] uppercase focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
              <button
                type="submit"
                disabled={!code.trim() || codeLoading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {codeLoading ? t('joinClubModal.checking') : t('joinClubModal.join')}
              </button>
            </form>
          ) : (
            <OpenClubsList />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

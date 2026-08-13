import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, Clock, Key } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMyClub } from '../../hooks/useMyClub';
import { API_URL } from '../../config/api';
import { CreateClubModal } from '../../components/club/CreateClubModal';
import { JoinClubModal } from '../../components/club/JoinClubModal';
import { OpenClubsList } from '../../components/club/OpenClubsList';

interface PendingRequestInfo {
  clubId: string;
  clubName: string;
  requestedAt: string;
}

// Экран «Клуб» для игрока без клуба: заявка в процессе / создать / список открытых клубов.
export const ClubBrowse = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { refresh: refreshMyClub } = useMyClub();
  const [pending, setPending] = useState<PendingRequestInfo | null | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/clubs/my-request`, { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => alive && setPending(data))
      .catch(() => alive && setPending(null));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-6">
          <button
            onClick={() => navigate('/')}
            aria-label={t('myClub.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-lg font-bold">{t('clubBrowse.title')}</h1>
        </div>

        {pending && (
          <div className="rounded-2xl bg-gray-900 border border-amber-500/20 p-4 mb-6 flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-amber-300">{t('clubBrowse.pendingTitle')}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {t('clubBrowse.pendingText', { name: pending.clubName })}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                {new Date(pending.requestedAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-950/90 border border-white/10 hover:border-emerald-500/40 transition-all duration-200 text-left group mb-4"
        >
          <div className="shrink-0 w-11 h-11 rounded-xl bg-gray-800/80 border border-white/10 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 flex items-center justify-center transition-all duration-200">
            <Shield size={22} className="text-gray-500 group-hover:text-emerald-400 transition-colors duration-200" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-gray-300 font-bold text-sm group-hover:text-white transition-colors duration-200">{t('mainMenu.createClub')}</div>
            <div className="text-gray-600 text-xs mt-0.5">{t('mainMenu.createClubSub')}</div>
          </div>
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-gray-600 uppercase tracking-wide">{t('clubBrowse.or')}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <OpenClubsList autoSearch />

        <button
          onClick={() => setShowJoin(true)}
          className="w-full flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-500 hover:text-emerald-400 py-1.5 transition-colors duration-200"
        >
          <Key size={12} />
          {t('clubBrowse.haveCode')}
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateClubModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              refreshMyClub();
              navigate('/my-club');
            }}
          />
        )}
        {showJoin && (
          <JoinClubModal
            onClose={() => setShowJoin(false)}
            onJoined={() => {
              setShowJoin(false);
              refreshMyClub();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

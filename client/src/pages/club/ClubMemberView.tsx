import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LayoutGrid, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import type { MyClub } from '../../store/clubStore';

interface Props {
  club: MyClub;
  onRefresh: () => void;
}

// Экран «Клуб» для рядового участника (не владельца) — просмотр состава + выход.
export const ClubMemberView = ({ club, onRefresh }: Props) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    if (!confirm(t('clubMember.leaveConfirm', { name: club.name }))) return;
    setLeaving(true);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}/leave`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok) { toast.error(t('clubMember.error')); return; }
      toast.success(t('clubMember.left'));
      onRefresh();
      navigate('/');
    } catch {
      toast.error(t('clubMember.networkError'));
    } finally {
      setLeaving(false);
    }
  };

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
          <div className="text-center">
            <h1 className="text-lg font-bold truncate max-w-[200px]">{club.name}</h1>
            <p className="text-[10px] text-emerald-400 uppercase tracking-wide mt-0.5">{t('clubMember.subtitle')}</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/lobby')}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-950/90 border border-white/10 hover:border-emerald-500/40 transition-all duration-200 text-left group mb-6"
        >
          <div className="shrink-0 w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <LayoutGrid size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm">{t('clubMember.clubRooms')}</div>
            <div className="text-gray-500 text-xs mt-0.5">{t('clubMember.clubRoomsSub')}</div>
          </div>
        </button>

        <div className="rounded-2xl bg-gray-900 border border-white/10 overflow-hidden mb-6">
          {club.members.map((m, i) => (
            <div
              key={m.userId}
              className={'flex items-center gap-3 px-4 py-3 ' + (i > 0 ? 'border-t border-white/5' : '')}
            >
              <div
                className={
                  'w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ' +
                  (m.role === 'owner'
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-gray-700 border-white/10 text-gray-300')
                }
              >
                {m.username[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{m.username}</div>
                {m.role !== 'owner' && (
                  <div className="text-[10px] text-gray-500">
                    {t('myClub.joinedSince')} {new Date(m.joinedAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
              {m.role === 'owner' && (
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">{t('myClub.owner')}</span>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={leave}
          disabled={leaving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/10 disabled:opacity-40 transition-colors"
        >
          <LogOut size={15} />
          {t('clubMember.leave')}
        </button>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserX, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import type { MyClub } from '../../store/clubStore';

interface Props {
  club: MyClub;
  onRefresh: () => void;
}

export const MembersTab = ({ club, onRefresh }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState<string | null>(null); // userId занятого действия

  const kick = async (userId: string, username: string) => {
    if (!confirm(`Исключить ${username}?`)) return;
    setBusy(userId);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok) { toast.error('Ошибка'); return; }
      toast.success(`${username} исключён`);
      onRefresh();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setBusy(null);
    }
  };

  const handleRequest = async (userId: string, username: string, approve: boolean) => {
    setBusy(userId);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}/requests/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ approve }),
      });
      if (!r.ok) { toast.error('Ошибка'); return; }
      toast.success(approve ? `${username} принят` : `${username} отклонён`);
      onRefresh();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setBusy(null);
    }
  };

  const members = club.members.filter((m) => m.role !== 'owner');

  return (
    <div className="flex flex-col gap-4">
      {/* Заявки */}
      {club.pendingRequests.length > 0 && (
        <div className="rounded-2xl bg-gray-900 border border-amber-500/20 overflow-hidden">
          <div className="px-4 pt-3 pb-2 text-xs font-bold text-amber-400 uppercase tracking-wide">
            Заявки · {club.pendingRequests.length}
          </div>
          {club.pendingRequests.map((r) => (
            <motion.div
              key={r.userId}
              layout
              className="flex items-center gap-3 px-4 py-3 border-t border-white/5"
            >
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 text-xs font-bold shrink-0">
                {r.username[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="flex-1 text-sm text-white font-medium truncate">{r.username}</span>
              <button
                onClick={() => handleRequest(r.userId, r.username, false)}
                disabled={busy === r.userId}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
              >
                <X size={16} />
              </button>
              <button
                onClick={() => handleRequest(r.userId, r.username, true)}
                disabled={busy === r.userId}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
              >
                <Check size={16} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Участники */}
      <div className="rounded-2xl bg-gray-900 border border-white/10 overflow-hidden">
        {/* Владелец */}
        {club.members
          .filter((m) => m.role === 'owner')
          .map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 text-xs font-bold shrink-0">
                {m.username[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="flex-1 text-sm text-white font-medium truncate">{m.username}</span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">владелец</span>
            </div>
          ))}

        {/* Остальные участники */}
        {members.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-500 border-t border-white/5">
            Пока нет участников
          </div>
        ) : (
          members.map((m) => (
            <motion.div
              key={m.userId}
              layout
              className={'flex items-center gap-3 px-4 py-3 border-t border-white/5'}
            >
              <div className="w-8 h-8 rounded-full bg-gray-700 border border-white/10 flex items-center justify-center text-gray-300 text-xs font-bold shrink-0">
                {m.username[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{m.username}</div>
                <div className="text-[10px] text-gray-500">
                  с {new Date(m.joinedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <button
                onClick={() => kick(m.userId, m.username)}
                disabled={busy === m.userId}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                title="Исключить"
              >
                <UserX size={16} />
              </button>
            </motion.div>
          ))
        )}
      </div>

      <p className="text-[10px] text-gray-600 text-center">
        Всего участников: {club.members.length}
      </p>
    </div>
  );
};

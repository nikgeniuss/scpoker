import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Shield, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import type { MyClub } from '../../hooks/useMyClub';

interface Props {
  onClose: () => void;
  onCreated: (club: MyClub) => void;
}

export const CreateClubModal = ({ onClose, onCreated }: Props) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch(API_URL + '/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.error === 'already-owns-club' ? t('createClubModal.alreadyOwnsClub') :
          data.error === 'name-taken' ? t('createClubModal.nameTaken') :
          data.error === 'invalid-name' ? t('createClubModal.invalidName') :
          t('createClubModal.createError');
        toast.error(msg);
        return;
      }
      toast.success(t('createClubModal.created'));
      onCreated(data as MyClub);
    } catch {
      toast.error(t('createClubModal.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-950 border border-emerald-500/30 rounded-3xl p-6 w-full max-w-sm"
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-600/15 border border-emerald-500/30 flex items-center justify-center">
              <Shield size={20} className="text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white">{t('createClubModal.title')}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('createClubModal.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createClubModal.namePlaceholder')}
              maxLength={50}
              autoFocus
              className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
            />
            <div className="text-right text-[10px] text-gray-600 mt-1">{name.trim().length}/50</div>
          </div>

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm font-bold hover:bg-white/5 transition-colors"
            >
              {t('createClubModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('createClubModal.creating') : t('createClubModal.create')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

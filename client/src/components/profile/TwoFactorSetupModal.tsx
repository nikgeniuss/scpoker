import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';

interface Props {
  onClose: () => void;
  onEnabled: () => void;
}

// Подключение 2FA: шаг 1 — секрет (текстовый, без QR — см. ROADMAP §10.15), шаг 2 — код из
// приложения подтверждает секрет, шаг 3 — одноразовый показ backup-кодов.
export const TwoFactorSetupModal = ({ onClose, onEnabled }: Props) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/auth/2fa/setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.secret) setSecret(data.secret);
        else {
          toast.error(data.error || t('twoFactorModal.setupFailed'));
          onClose();
        }
      })
      .catch(() => {
        toast.error(t('twoFactorModal.setupFailed'));
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('twoFactorModal.invalidCode'));
        return;
      }
      setBackupCodes(data.backupCodes);
      onEnabled();
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    toast.success(t('twoFactorModal.enabled'));
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={backupCodes ? undefined : onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-emerald-500/30 rounded-3xl p-5 w-full max-w-sm"
      >
        {backupCodes ? (
          <>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-white">{t('twoFactorModal.backupTitle')}</h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">{t('twoFactorModal.backupHint')}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {backupCodes.map((c) => (
                <span key={c} className="font-mono text-sm text-center text-white bg-white/5 rounded-lg py-2">
                  {c}
                </span>
              ))}
            </div>
            <button
              onClick={finish}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600"
            >
              {t('twoFactorModal.done')}
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">{t('twoFactorModal.setupTitle')}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{t('twoFactorModal.setupInstructions')}</p>
            <div className="font-mono text-center text-white bg-white/5 rounded-lg py-3 mb-4 tracking-widest select-all">
              {secret ?? '…'}
            </div>
            <input
              type="text"
              autoFocus
              placeholder={t('twoFactorModal.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 mb-3 rounded-xl bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 text-center tracking-widest"
            />
            <button
              onClick={confirm}
              disabled={!secret || !code.trim() || loading}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 disabled:opacity-50"
            >
              {t('twoFactorModal.confirm')}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

interface DisableProps {
  onClose: () => void;
  onDisabled: () => void;
}

// Отключение 2FA — требует текущий TOTP-код или backup-код (см. disableTwoFactor на сервере).
export const TwoFactorDisableModal = ({ onClose, onDisabled }: DisableProps) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const disable = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('twoFactorModal.disableFailed'));
        return;
      }
      toast.success(t('twoFactorModal.disabled'));
      onDisabled();
      onClose();
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
        className="bg-gray-900 border border-emerald-500/30 rounded-3xl p-5 w-full max-w-sm"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{t('twoFactorModal.disableTitle')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">{t('twoFactorModal.disableHint')}</p>
        <input
          type="text"
          autoFocus
          placeholder={t('twoFactorModal.codePlaceholder')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full px-4 py-3 mb-3 rounded-xl bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-rose-500 text-center tracking-widest"
        />
        <button
          onClick={disable}
          disabled={!code.trim() || loading}
          className="w-full py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
        >
          {t('twoFactorModal.disableConfirm')}
        </button>
      </motion.div>
    </motion.div>
  );
};

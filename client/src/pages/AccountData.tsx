import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import { TwoFactorSetupModal, TwoFactorDisableModal } from '../components/profile/TwoFactorSetupModal';

interface AccountInfo {
  email?: string;
  publicId?: string;
  createdAt?: string;
  telegramId?: number;
  twoFactorEnabled?: boolean;
}

// Строка профиля с инлайн-редактированием (имя пользователя / email). Карандаш → инпут → сохранить/отмена.
function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const save = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <span className="text-sm text-white/40 flex-shrink-0">{label}</span>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            disabled={saving}
            className="min-w-0 flex-1 bg-white/10 rounded-lg px-2 py-1 text-sm text-right outline-none border border-white/15 focus:border-emerald-500/50"
          />
          <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
            <Check size={18} />
          </button>
          <button onClick={() => setEditing(false)} disabled={saving} className="text-white/40 hover:text-white/70 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-white/40">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value || '—'}</span>
        <button onClick={startEdit} className="text-white/30 hover:text-white/70">
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}

export function AccountData() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const login = useAuthStore(s => s.login);
  const navigate = useNavigate();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [twoFactorModal, setTwoFactorModal] = useState<'setup' | 'disable' | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { user?: AccountInfo } | null) => setInfo(data?.user ?? null))
      .catch(() => setInfo(null));
  }, [token]);

  if (!user) return null;

  const saveUsername = async (next: string) => {
    const res = await fetch(`${API_URL}/auth/username`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || t('accountData.usernameChangeFailed'));
      return;
    }
    // Новый токен — username зашит в JWT и используется при socket-авторизации (имя за столом)
    login(data.token, { ...user, username: data.user.username });
    toast.success(t('accountData.usernameChanged'));
  };

  const saveEmail = async (next: string) => {
    const res = await fetch(`${API_URL}/auth/email`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || t('accountData.emailChangeFailed'));
      return;
    }
    setInfo((prev) => (prev ? { ...prev, email: data.email } : prev));
    toast.success(t('accountData.emailChanged'));
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('accountData.title')}</span>
      </div>

      <div className="flex-1 px-4">
        <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
          <EditableField label={t('accountData.username')} value={user.username} onSave={saveUsername} />
          <EditableField label={t('accountData.email')} value={info?.email ?? ''} onSave={saveEmail} />

          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-white/40">{t('accountData.publicId')}</span>
            <span className="text-sm font-medium">{info?.publicId ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-white/40">{t('accountData.registeredAt')}</span>
            <span className="text-sm font-medium">
              {info?.createdAt
                ? new Date(info.createdAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-white/40">{t('accountData.telegram')}</span>
            <span className="text-sm font-medium">{info?.telegramId ? t('accountData.telegramLinked') : t('accountData.telegramNotLinked')}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-white/40">{t('accountData.kyc')}</span>
            <span className="text-sm font-medium text-white/50">{t('accountData.kycNotVerified')}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-white/40">{t('accountData.twoFactor')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {info?.twoFactorEnabled ? t('accountData.twoFactorEnabled') : t('accountData.twoFactorDisabled')}
              </span>
              <button
                onClick={() => setTwoFactorModal(info?.twoFactorEnabled ? 'disable' : 'setup')}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
              >
                {info?.twoFactorEnabled ? t('accountData.twoFactorDisable') : t('accountData.twoFactorEnable')}
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/devices')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/5"
          >
            <span className="text-sm text-white/40">{t('accountData.devices')}</span>
            <ChevronRight size={16} className="text-white/20" />
          </button>
        </div>
      </div>

      {twoFactorModal === 'setup' && (
        <TwoFactorSetupModal
          onClose={() => setTwoFactorModal(null)}
          onEnabled={() => setInfo((prev) => (prev ? { ...prev, twoFactorEnabled: true } : prev))}
        />
      )}
      {twoFactorModal === 'disable' && (
        <TwoFactorDisableModal
          onClose={() => setTwoFactorModal(null)}
          onDisabled={() => setInfo((prev) => (prev ? { ...prev, twoFactorEnabled: false } : prev))}
        />
      )}
    </div>
  );
}

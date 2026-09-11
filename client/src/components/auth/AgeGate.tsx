import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import { getDeviceId } from '../../lib/deviceId';

// Шаг подтверждения возраста 18+ (§11.2). Сервер отвечает `dobRequired` + pendingToken на
// /auth/login, /auth/login/2fa и /auth/telegram, если у аккаунта нет даты рождения (или аккаунта
// ещё нет — вход через Telegram). Форма отправляет дату на /auth/dob и завершает вход.
// variant: 'inline' — внутри карточки логина, 'modal' — оверлей поверх экрана (Telegram Mini App).
interface Props {
  pendingToken: string;
  variant?: 'inline' | 'modal';
  onCancel: () => void;
  onDone?: () => void;
}

export const AgeGate = ({ pendingToken, variant = 'inline', onCancel, onDone }: Props) => {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!dateOfBirth) {
      setError(t('auth.ageGate.dobRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(API_URL + '/auth/dob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
        body: JSON.stringify({ pendingToken, dateOfBirth }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('auth.ageGate.error'));
        return;
      }
      login(data.token, data.user);
      onDone?.();
    } catch {
      setError(t('auth.ageGate.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-gray-300 text-sm text-center">{t('auth.ageGate.hint')}</p>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      <input
        type="date"
        autoFocus
        aria-label={t('auth.ageGate.dobLabel')}
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        className="w-full px-4 py-3 rounded-xl bg-gray-700 text-white outline-none focus:ring-2 focus:ring-poker-gold [color-scheme:dark]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 disabled:opacity-60"
      >
        {submitting ? t('auth.ageGate.submitting') : t('auth.ageGate.submit')}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-gray-400 hover:text-white text-sm">
        {t('auth.ageGate.cancel')}
      </button>
    </form>
  );

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="bg-gray-800 p-6 rounded-3xl shadow-2xl w-full max-w-sm">
          <h2 className="text-2xl font-black mb-4 text-center text-poker-gold">{t('auth.ageGate.title')}</h2>
          {form}
        </div>
      </div>
    );
  }

  return (
    <>
      <h3 className="text-xl font-bold mb-4 text-center text-poker-gold">{t('auth.ageGate.title')}</h3>
      {form}
    </>
  );
};

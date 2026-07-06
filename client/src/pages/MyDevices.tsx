import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config/api';
import { summarizeUserAgent } from '../utils/userAgent';

interface SessionView {
  sid: string;
  createdAt: string;
  userAgent: string;
  ip: string;
  current: boolean;
}

export function MyDevices() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_URL}/auth/sessions`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sessions?: SessionView[] } | null) => setSessions(data?.sessions ?? []))
      .catch(() => setSessions([]));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (sid: string) => {
    setRevoking(sid);
    try {
      const res = await fetch(`${API_URL}/auth/sessions/${sid}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error(t('myDevices.revokeFailed'));
        return;
      }
      setSessions((prev) => prev?.filter((s) => s.sid !== sid) ?? null);
      toast.success(t('myDevices.revoked'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
    <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('myDevices.title')}</span>
      </div>

      <div className="flex-1 px-4">
        {sessions === null ? null : sessions.length === 0 ? (
          <p className="text-sm text-white/40 text-center mt-8">{t('myDevices.empty')}</p>
        ) : (
          <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
            {sessions.map((s) => (
              <div key={s.sid} className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-white/30 flex-shrink-0">
                  <Smartphone size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {summarizeUserAgent(s.userAgent)}
                    {s.current && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                        {t('myDevices.current')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/30">
                    {new Date(s.createdAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'ru-RU')}
                  </div>
                </div>
                <button
                  onClick={() => revoke(s.sid)}
                  disabled={revoking === s.sid}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300 disabled:opacity-40 flex-shrink-0"
                >
                  {t('myDevices.revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

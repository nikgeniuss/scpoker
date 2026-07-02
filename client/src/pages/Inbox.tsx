import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Inbox as InboxIcon, Coins, ShieldX, ShieldCheck, Megaphone, ArrowDownToLine, ArrowUpFromLine, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useInboxStore } from '../store/inboxStore';
import type { InboxNotification } from '@poker-room/shared';

const TYPE_META: Record<InboxNotification['type'], { icon: React.ReactNode; color: string; labelKey: string }> = {
  chips:     { icon: <Coins size={18} />,      color: 'text-emerald-400', labelKey: 'inbox.typeChips' },
  ban:       { icon: <ShieldX size={18} />,    color: 'text-red-400',     labelKey: 'inbox.typeBan' },
  unban:     { icon: <ShieldCheck size={18} />, color: 'text-blue-400',   labelKey: 'inbox.typeUnban' },
  broadcast: { icon: <Megaphone size={18} />,  color: 'text-amber-400',   labelKey: 'inbox.typeBroadcast' },
  deposit:   { icon: <ArrowDownToLine size={18} />, color: 'text-emerald-400', labelKey: 'inbox.typeDeposit' },
  withdrawal: { icon: <ArrowUpFromLine size={18} />, color: 'text-blue-400',   labelKey: 'inbox.typeWithdrawal' },
  'rg-warning': { icon: <ShieldAlert size={18} />, color: 'text-amber-400',   labelKey: 'inbox.typeRgWarning' },
};

function timeAgo(t: number, lang: string, tr: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return tr('common.time.justNow');
  if (diff < 3600) return tr('common.time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return tr('common.time.hoursAgo', { count: Math.floor(diff / 3600) });
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU');
}

export function Inbox() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore(s => s.token);
  const { notifications, unread, loaded, fetchInbox, markRead } = useInboxStore();

  useEffect(() => {
    if (token && !loaded) fetchInbox(token);
  }, [token, loaded, fetchInbox]);

  useEffect(() => {
    if (unread > 0 && token) markRead(token);
  }, [unread, token, markRead]);

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-4">
        <button
          onClick={() => navigate('/profile')}
          aria-label={t('inbox.back')}
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <span className="text-lg font-bold">{t('inbox.title')}</span>
      </div>

      <div className="flex-1 px-4">
        {!loaded ? (
          <div className="flex items-center justify-center py-16 text-white/20">{t('inbox.loading')}</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/20">
            <InboxIcon size={40} />
            <span className="text-sm">{t('inbox.empty')}</span>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
            {notifications.map(n => {
              const meta = TYPE_META[n.type] ?? TYPE_META.broadcast;
              return (
                <div
                  key={n.id}
                  className={'flex items-start gap-3 px-4 py-3.5 ' + (!n.read ? 'bg-white/5' : '')}
                >
                  <span className={'mt-0.5 ' + meta.color}>{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/40 mb-0.5">{t(meta.labelKey)}</div>
                    <div className="text-sm text-white">{n.text}</div>
                  </div>
                  <div className="text-[10px] text-white/25 shrink-0 mt-1">{timeAgo(n.t, i18n.language, t)}</div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pb-24" />
    </div>
  );
}

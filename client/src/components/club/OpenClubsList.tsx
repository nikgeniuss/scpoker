import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';

interface OpenClub {
  id: string;
  name: string;
  memberCount: number;
}

interface Props {
  // Искать сразу при монтировании (страница «Клуб»), без — только по кнопке (модалка вступления).
  autoSearch?: boolean;
}

// Список открытых клубов (принимают заявки без кода) + поиск + подача заявки.
// Общий для JoinClubModal («Найти клуб») и страницы /club («нет клуба»).
export const OpenClubsList = ({ autoSearch = false }: Props) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [query, setQuery] = useState('');
  const [clubs, setClubs] = useState<OpenClub[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);

  const doSearch = async (q: string) => {
    setSearching(true);
    try {
      const r = await fetch(`${API_URL}/clubs/open?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (r.ok) setClubs(await r.json());
    } catch {
      toast.error(t('joinClubModal.networkError'));
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  useEffect(() => {
    if (autoSearch) void doSearch('');
    // Только при монтировании — дальше поиск по кнопке/Enter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitRequest = async (clubId: string, clubName: string) => {
    setRequesting(clubId);
    try {
      const r = await fetch(`${API_URL}/clubs/${clubId}/requests`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error === 'already-member' ? t('joinClubModal.alreadyMember')
                  : data.error === 'already-requested' ? t('joinClubModal.alreadyRequested') : t('joinClubModal.error');
        toast.error(msg);
        return;
      }
      toast.success(t('joinClubModal.requestSent', { name: clubName }));
      setRequested((prev) => new Set(prev).add(clubId));
    } catch {
      toast.error(t('joinClubModal.networkError'));
    } finally {
      setRequesting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">{t('joinClubModal.openClubsHint')}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
          placeholder={t('joinClubModal.clubNamePlaceholder')}
          className="flex-1 bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
        />
        <button
          onClick={() => doSearch(query)}
          disabled={searching}
          className="px-4 py-2.5 rounded-xl bg-gray-800 border border-white/10 text-white text-sm font-bold hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {searching ? '…' : t('joinClubModal.search')}
        </button>
      </div>

      {clubs.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {clubs.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-900 border border-white/5"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Users size={14} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{c.name}</div>
                <div className="text-[10px] text-gray-500">{t('joinClubModal.membersCount', { count: c.memberCount })}</div>
              </div>
              <button
                onClick={() => submitRequest(c.id, c.name)}
                disabled={requesting === c.id || requested.has(c.id)}
                className={'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
                  (requested.has(c.id)
                    ? 'bg-gray-700 text-gray-400 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40')}
              >
                {requested.has(c.id) ? t('joinClubModal.sent') : requesting === c.id ? '…' : t('joinClubModal.sendRequest')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-xs text-gray-600 py-4">
          {searched ? (
            <span className="flex items-center justify-center gap-1.5"><Search size={12} /> {t('joinClubModal.noOpenClubs')}</span>
          ) : (
            t('joinClubModal.pressSearchHint')
          )}
        </div>
      )}
    </div>
  );
};

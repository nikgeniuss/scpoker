import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Key, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';

interface Props {
  onClose: () => void;
  onJoined: () => void;
}

type Tab = 'code' | 'search';

interface OpenClub {
  id: string;
  name: string;
  memberCount: number;
}

export const JoinClubModal = ({ onClose, onJoined }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>('code');

  // Вкладка «По коду»
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  // Вкладка «Найти клуб»
  const [query, setQuery] = useState('');
  const [clubs, setClubs] = useState<OpenClub[]>([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);

  const joinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setCodeLoading(true);
    try {
      const r = await fetch(`${API_URL}/clubs/join/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error === 'invalid-code' ? 'Неверный код'
                  : data.error === 'already-member' ? 'Вы уже в этом клубе' : 'Ошибка';
        toast.error(msg);
        return;
      }
      toast.success('Вы вступили в клуб «' + data.name + '»');
      onJoined();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setCodeLoading(false);
    }
  };

  const doSearch = async () => {
    setSearching(true);
    try {
      const r = await fetch(`${API_URL}/clubs/open?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (r.ok) setClubs(await r.json());
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setSearching(false);
    }
  };

  const submitRequest = async (clubId: string, clubName: string) => {
    setRequesting(clubId);
    try {
      const r = await fetch(`${API_URL}/clubs/${clubId}/requests`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error === 'already-member' ? 'Вы уже в этом клубе'
                  : data.error === 'already-requested' ? 'Заявка уже отправлена' : 'Ошибка';
        toast.error(msg);
        return;
      }
      toast.success('Заявка в «' + clubName + '» отправлена');
      setRequested((prev) => new Set(prev).add(clubId));
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setRequesting(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f0f0f] w-full md:max-w-sm rounded-t-3xl md:rounded-3xl border-t border-white/10 md:border overflow-hidden"
      >
        {/* Шапка */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-white"
          >
            <ChevronLeft size={22} />
          </button>
          <h3 className="text-base font-bold text-white">Вступить в клуб</h3>
        </div>

        {/* Табы */}
        <div className="grid grid-cols-2 gap-1 px-5 pb-4">
          {([
            { id: 'code', label: 'По коду', Icon: Key },
            { id: 'search', label: 'Найти клуб', Icon: Search },
          ] as { id: Tab; label: string; Icon: typeof Key }[]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                'flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ' +
                (tab === id ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white')
              }
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 pb-7">
          {tab === 'code' ? (
            <form onSubmit={joinByCode} className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">Введите инвайт-код, который прислал вам владелец клуба.</p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="XXXXXXXX"
                autoFocus
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-mono text-xl tracking-[0.3em] uppercase focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
              <button
                type="submit"
                disabled={!code.trim() || codeLoading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {codeLoading ? 'Проверяем…' : 'Вступить'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">Клубы, открытые для заявок без кода.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  placeholder="Название клуба…"
                  className="flex-1 bg-gray-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
                />
                <button
                  onClick={doSearch}
                  disabled={searching}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 border border-white/10 text-white text-sm font-bold hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  {searching ? '…' : 'Найти'}
                </button>
              </div>

              {clubs.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
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
                        <div className="text-[10px] text-gray-500">{c.memberCount} участников</div>
                      </div>
                      <button
                        onClick={() => submitRequest(c.id, c.name)}
                        disabled={requesting === c.id || requested.has(c.id)}
                        className={'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
                          (requested.has(c.id)
                            ? 'bg-gray-700 text-gray-400 cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40')}
                      >
                        {requested.has(c.id) ? 'Отправлено' : requesting === c.id ? '…' : 'Подать заявку'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-xs text-gray-600 py-4">
                  Нажмите «Найти» для поиска
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

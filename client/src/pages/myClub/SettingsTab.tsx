import { useState } from 'react';
import { Copy, RefreshCw, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { Toggle } from '../../components/lobby/createControls';
import { useAuthStore } from '../../store/authStore';
import { API_URL } from '../../config/api';
import type { MyClub } from '../../store/clubStore';

interface Props {
  club: MyClub;
  onRefresh: () => void;
}

export const SettingsTab = ({ club, onRefresh }: Props) => {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState(club.name);
  const [nameLoading, setNameLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [openJoin, setOpenJoinLocal] = useState<boolean>(!!club.settings.openJoin);
  const [openJoinLoading, setOpenJoinLoading] = useState(false);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === club.name) return;
    setNameLoading(true);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error === 'name-taken' ? 'Название занято' :
                    data.error === 'invalid-name' ? 'Некорректное название' : 'Ошибка';
        toast.error(msg);
        return;
      }
      toast.success('Название сохранено');
      onRefresh();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setNameLoading(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(club.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const toggleOpenJoin = async (v: boolean) => {
    setOpenJoinLocal(v);
    setOpenJoinLoading(true);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ openJoin: v }),
      });
      if (!r.ok) { toast.error('Ошибка'); setOpenJoinLocal(!v); return; }
      toast.success(v ? 'Клуб открыт для заявок' : 'Заявки без кода отключены');
      onRefresh();
    } catch {
      toast.error('Ошибка сети');
      setOpenJoinLocal(!v);
    } finally {
      setOpenJoinLoading(false);
    }
  };

  const regenerateCode = async () => {
    if (!confirm('Старый код перестанет работать. Продолжить?')) return;
    setCodeLoading(true);
    try {
      const r = await fetch(`${API_URL}/clubs/${club.id}/invite/regenerate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok) { toast.error('Ошибка'); return; }
      toast.success('Новый код создан');
      onRefresh();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Открытые заявки */}
      <div className="rounded-2xl bg-gray-900 border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white font-semibold">Открытые заявки</div>
            <div className="text-xs text-gray-500 mt-0.5">Игроки могут найти клуб и подать заявку без кода</div>
          </div>
          <Toggle checked={openJoin} onChange={toggleOpenJoin} disabled={openJoinLoading} />
        </div>
      </div>

      {/* Название */}
      <div className="rounded-2xl bg-gray-900 border border-white/10 p-4">
        <div className="text-xs text-gray-400 mb-3 font-bold uppercase tracking-wide">Название клуба</div>
        <form onSubmit={saveName} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
          />
          <button
            type="submit"
            disabled={!name.trim() || name.trim() === club.name || nameLoading}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {nameLoading ? '…' : 'Сохранить'}
          </button>
        </form>
      </div>

      {/* Инвайт-код */}
      <div className="rounded-2xl bg-gray-900 border border-white/10 p-4">
        <div className="text-xs text-gray-400 mb-3 font-bold uppercase tracking-wide">Инвайт-код</div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5">
            <span className="font-mono text-lg font-bold text-white tracking-[0.2em]">
              {club.inviteCode}
            </span>
          </div>
          <button
            onClick={copyCode}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 border border-white/10 text-gray-400 hover:text-white transition-colors"
            title="Скопировать"
          >
            {codeCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Поделитесь этим кодом — игрок вступит в клуб через «Вступить по коду».
        </p>
        <button
          onClick={regenerateCode}
          disabled={codeLoading}
          className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={13} className={codeLoading ? 'animate-spin' : ''} />
          Сгенерировать новый код
        </button>
      </div>

      {/* Мета */}
      <div className="rounded-2xl bg-gray-900 border border-white/10 p-4 text-sm text-gray-400">
        <div className="flex justify-between py-1">
          <span>Создан</span>
          <span className="text-white">
            {new Date(club.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="flex justify-between py-1 border-t border-white/5 mt-1">
          <span>ID клуба</span>
          <span className="text-gray-500 font-mono text-xs">{club.id.slice(0, 8)}…</span>
        </div>
      </div>
    </div>
  );
};

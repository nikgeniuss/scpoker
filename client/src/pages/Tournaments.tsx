import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useTournamentStore } from '../store/tournamentStore';
import { TournamentCard } from '../components/lobby/TournamentCard';
import { CreateTournamentModal } from '../components/lobby/CreateTournamentModal';
import { PageBackground } from '../components/layout/PageBackground';
import type { CreateTournamentOptions } from '@poker-room/shared';

// Турниры (ROADMAP §10 «Турниры», SNG v1). Создаёт ТОЛЬКО админ — реальный призовой фонд
// (решение пользователя); регистрация открыта всем. Список — REST-поллинг (см. tournamentStore).
export const Tournaments = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { tournaments, fetchTournaments, register, unregister, createTournament, cancelTournament, forceStartTournament, addBots } = useTournamentStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchTournaments(token);
    const id = setInterval(() => fetchTournaments(token), 5000);
    return () => clearInterval(id);
  }, [token, fetchTournaments]);

  const active = tournaments.filter((t) => t.status !== 'cancelled');

  const handleCreate = async (opts: CreateTournamentOptions) => {
    if (!token) return;
    const result = await createTournament(token, opts);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setShowCreate(false);
  };

  const withToken = (fn: (token: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>, id: string) => async () => {
    if (!token) return;
    const result = await fn(token, id);
    if (!result.ok) toast.error(result.error);
  };

  const handleAddBots = async (id: string, count: number) => {
    if (!token) return;
    const result = await addBots(token, id, count);
    if (!result.ok) toast.error(result.error);
  };

  return (
    <>
      <PageBackground />
      <div className="container mx-auto px-4 pt-0 pb-12 relative z-10">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy size={20} className="text-amber-400" /> {t('tournaments.title')}
          </h1>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-white text-sm shadow-lg shadow-amber-500/30"
            >
              <Plus size={14} /> {t('tournaments.create')}
            </button>
          )}
        </div>

        {active.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-6xl mb-4">🏆</p>
            <p>{t('tournaments.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                myId={myId}
                isAdmin={isAdmin}
                onRegister={withToken(register, t.id)}
                onUnregister={withToken(unregister, t.id)}
                onForceStart={withToken(forceStartTournament, t.id)}
                onCancel={withToken(cancelTournament, t.id)}
                onAddBots={(count) => handleAddBots(t.id, count)}
                onGoToTable={() => {
                  const myTableId = t.entries.find((e) => e.userId === myId)?.tableId ?? t.tableIds[0];
                  if (myTableId) navigate('/game/' + myTableId);
                }}
              />
            ))}
          </div>
        )}

        <AnimatePresence>
          {showCreate && (
            <CreateTournamentModal onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

import { motion } from 'framer-motion';
import { Coins, Users, Zap, Trophy } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import type { TournamentInfo } from '@poker-room/shared';

const SPEED_LABEL: Record<TournamentInfo['blindSpeed'], string> = {
  slow: 'Медленно',
  regular: 'Стандартная',
  turbo: 'Турбо',
  hyper: 'Гипер Турбо',
};

function isLateRegOpen(t: TournamentInfo): boolean {
  if (t.type !== 'mtt' || t.status !== 'running' || !t.startedAt) return false;
  return Date.now() < t.startedAt + t.lateRegMinutes * 60_000;
}

interface TournamentCardProps {
  tournament: TournamentInfo;
  myId: string | null;
  isAdmin: boolean;
  onRegister: () => void;
  onUnregister: () => void;
  onForceStart: () => void;
  onCancel: () => void;
  onGoToTable: () => void;
}

export const TournamentCard = ({
  tournament: t, myId, isAdmin, onRegister, onUnregister, onForceStart, onCancel, onGoToTable,
}: TournamentCardProps) => {
  const myEntry = myId ? t.entries.find((e) => e.userId === myId) : undefined;
  const isFull = t.type === 'sng' && t.entries.length >= t.tableSize;
  const lateRegOpen = isLateRegOpen(t);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl px-5 py-4 border bg-gray-900/55 backdrop-blur-md border-white/10 hover:border-amber-500/50 transition-colors"
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Trophy size={16} className="text-amber-400 shrink-0" />
            <h3 className="text-lg font-bold text-white truncate">{t.name}</h3>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-300 uppercase tracking-wider shrink-0">
              {t.format === 'shortdeck' ? 'Шорт-дэк' : 'NLH'}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-white/10 text-gray-300 uppercase tracking-wider shrink-0">
              {t.type === 'mtt' ? 'MTT' : 'SNG'}
            </span>
          </div>
        </div>
        <span
          className={
            'px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0 ' +
            (t.status === 'registering'
              ? 'bg-emerald-500/20 text-emerald-400'
              : t.status === 'running'
              ? 'bg-red-500/20 text-red-400'
              : t.status === 'finished'
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-gray-700/40 text-gray-500')
          }
        >
          {t.status === 'registering' ? 'Регистрация' : t.status === 'running' ? 'Идёт' : t.status === 'finished' ? 'Завершён' : 'Отменён'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mb-3">
        <span className="inline-flex items-center gap-1">
          <Coins size={11} /> Бай-ин <span className="text-white font-bold">{formatMoney(t.buyIn)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> <span className="text-amber-400 font-bold">{t.entries.length}/{t.tableSize}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Zap size={11} /> <span className="text-amber-400 font-bold">{SPEED_LABEL[t.blindSpeed]}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          Призовой фонд <span className="text-emerald-400 font-bold">{formatMoney(t.prizePool)}</span>
        </span>
        {t.tableIds.length > 1 && (
          <span className="inline-flex items-center gap-1">
            Столов <span className="text-amber-400 font-bold">{t.tableIds.length}</span>
          </span>
        )}
      </div>

      {t.status === 'finished' && (
        <div className="mb-3 text-xs text-gray-400 space-y-0.5">
          {t.entries
            .filter((e) => e.finishPlace)
            .sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99))
            .slice(0, 3)
            .map((e) => (
              <div key={e.userId} className="flex justify-between">
                <span>{e.finishPlace}. {e.username}</span>
                {!!e.prize && <span className="text-emerald-400 font-bold">{formatMoney(e.prize)}</span>}
              </div>
            ))}
        </div>
      )}

      {t.status === 'registering' && (
        myEntry ? (
          <button
            onClick={onUnregister}
            className="w-full py-2 rounded-xl font-bold transition-all bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            Отменить регистрацию
          </button>
        ) : (
          <button
            onClick={onRegister}
            disabled={isFull}
            className={
              'w-full py-2 rounded-xl font-bold transition-all ' +
              (isFull
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30')
            }
          >
            {isFull ? 'Стол полон' : 'Зарегистрироваться'}
          </button>
        )
      )}

      {t.status === 'running' && myEntry?.status === 'playing' && (
        <button
          onClick={onGoToTable}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-emerald-500 to-green-600 text-white"
        >
          Вернуться за стол
        </button>
      )}

      {t.status === 'running' && !myEntry && lateRegOpen && (
        <button
          onClick={onRegister}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30"
        >
          Зарегистрироваться (поздняя рег.)
        </button>
      )}

      {isAdmin && t.status === 'registering' && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={onForceStart}
            disabled={t.entries.length < 2}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Начать сейчас
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20"
          >
            Отменить турнир
          </button>
        </div>
      )}
    </motion.div>
  );
};

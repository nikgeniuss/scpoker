import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Coins, Users, Zap, Trophy } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import type { TournamentInfo } from '@poker-room/shared';

function isLateRegOpen(t: TournamentInfo): boolean {
  if (t.type !== 'mtt' || t.status !== 'running' || !t.startedAt) return false;
  return Date.now() < t.startedAt + t.lateRegMinutes * 60_000;
}

function isRegNotOpenYet(t: TournamentInfo): boolean {
  return t.status === 'registering' && !!t.regOpensAt && Date.now() < t.regOpensAt;
}

function formatScheduled(ts: number, lang: string): string {
  return new Date(ts).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
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
  onAddBots: (count: number) => void;
}

export const TournamentCard = ({
  tournament: trn, myId, isAdmin, onRegister, onUnregister, onForceStart, onCancel, onGoToTable, onAddBots,
}: TournamentCardProps) => {
  const { t, i18n } = useTranslation();
  const [botCount, setBotCount] = useState(3);
  const SPEED_LABEL: Record<TournamentInfo['blindSpeed'], string> = {
    slow: t('tournamentCard.speedSlow'),
    regular: t('tournamentCard.speedRegular'),
    turbo: t('tournamentCard.speedTurbo'),
    hyper: t('tournamentCard.speedHyper'),
  };
  // С ре-энтри (MTT) у игрока может быть несколько entries — старые eliminated, максимум одна
  // активная. Активная — то, что определяет UI (играет / может зайти заново / зарегистрирован).
  const myEntries = myId ? trn.entries.filter((e) => e.userId === myId) : [];
  const myEntry = myEntries.find((e) => e.status !== 'eliminated');
  const myBustedCount = myEntries.filter((e) => e.status === 'eliminated').length;
  const canReenter = trn.type === 'mtt' && trn.reEntryEnabled && myBustedCount > 0 &&
    myBustedCount <= (trn.maxReEntries ?? 0);
  const isFull = trn.type === 'sng' && trn.entries.length >= trn.tableSize;
  const lateRegOpen = isLateRegOpen(trn);
  const regNotOpenYet = isRegNotOpenYet(trn);

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
            <h3 className="text-lg font-bold text-white truncate">{trn.name}</h3>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-300 uppercase tracking-wider shrink-0">
              {trn.format === 'shortdeck' ? t('lobby.formatShortdeck') : 'NLH'}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-white/10 text-gray-300 uppercase tracking-wider shrink-0">
              {trn.type === 'mtt' ? 'MTT' : 'SNG'}
            </span>
          </div>
        </div>
        <span
          className={
            'px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0 ' +
            (trn.status === 'registering'
              ? 'bg-emerald-500/20 text-emerald-400'
              : trn.status === 'running'
              ? 'bg-red-500/20 text-red-400'
              : trn.status === 'finished'
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-gray-700/40 text-gray-500')
          }
        >
          {trn.status === 'registering' ? t('tournamentCard.statusRegistering') : trn.status === 'running' ? t('tournamentCard.statusRunning') : trn.status === 'finished' ? t('tournamentCard.statusFinished') : t('tournamentCard.statusCancelled')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mb-3">
        <span className="inline-flex items-center gap-1">
          <Coins size={11} /> {t('tournamentCard.buyIn')} <span className="text-white font-bold">{formatMoney(trn.buyIn)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> <span className="text-amber-400 font-bold">{trn.entries.length}/{trn.tableSize}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Zap size={11} /> <span className="text-amber-400 font-bold">{SPEED_LABEL[trn.blindSpeed]}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          {t('tournamentCard.prizePool')} <span className="text-emerald-400 font-bold">{formatMoney(trn.prizePool)}</span>
        </span>
        {!!trn.guaranteedPrizePool && trn.status !== 'finished' && (
          <span className="inline-flex items-center gap-1">
            {t('tournamentCard.guarantee')} <span className="text-amber-400 font-bold">{formatMoney(trn.guaranteedPrizePool)}</span>
          </span>
        )}
        {!!trn.overlayPaid && (
          <span className="inline-flex items-center gap-1">
            {t('tournamentCard.overlay')} <span className="text-amber-400 font-bold">{formatMoney(trn.overlayPaid)}</span>
          </span>
        )}
        {trn.tableIds.length > 1 && (
          <span className="inline-flex items-center gap-1">
            {t('tournamentCard.tables')} <span className="text-amber-400 font-bold">{trn.tableIds.length}</span>
          </span>
        )}
        {trn.bountyEnabled && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 font-bold">
            🎯 {t('tournamentCard.bounty')} {trn.bountyPercent}% {trn.bountyType === 'progressive' ? 'PKO' : ''}
          </span>
        )}
        {trn.status === 'registering' && !!trn.scheduledStartAt && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-gray-300">
            {t('tournamentCard.scheduledStart', { time: formatScheduled(trn.scheduledStartAt, i18n.language) })}
          </span>
        )}
      </div>

      {trn.bountyEnabled && myEntry && trn.status === 'running' && (
        <div className="mb-2 text-[11px] text-gray-400 flex justify-between">
          <span>{t('tournamentCard.myBounty')} <span className="text-red-300 font-bold">{formatMoney(myEntry.bounty ?? 0)}</span></span>
          {!!myEntry.bountyWon && (
            <span>{t('tournamentCard.bountyCollected')} <span className="text-emerald-400 font-bold">{formatMoney(myEntry.bountyWon)}</span></span>
          )}
        </div>
      )}

      {trn.status === 'finished' && (
        <div className="mb-3 text-xs text-gray-400 space-y-0.5">
          {trn.entries
            .filter((e) => e.finishPlace)
            .sort((a, b) => (a.finishPlace ?? 99) - (b.finishPlace ?? 99))
            .slice(0, 3)
            .map((e) => (
              <div key={e.userId} className="flex justify-between">
                <span>{e.finishPlace}. {e.username}</span>
                <span className="flex items-center gap-2">
                  {!!e.bountyWon && <span className="text-red-300 font-bold">🎯 +{formatMoney(e.bountyWon)}</span>}
                  {!!e.prize && <span className="text-emerald-400 font-bold">{formatMoney(e.prize)}</span>}
                </span>
              </div>
            ))}
        </div>
      )}

      {trn.status === 'registering' && (
        myEntry ? (
          <button
            onClick={onUnregister}
            className="w-full py-2 rounded-xl font-bold transition-all bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            {t('tournamentCard.unregister')}
          </button>
        ) : regNotOpenYet ? (
          <div className="w-full py-2 rounded-xl text-center font-bold bg-gray-800 text-gray-400 text-sm">
            {t('tournamentCard.regOpensAt', { time: formatScheduled(trn.regOpensAt!, i18n.language) })}
          </div>
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
            {isFull ? t('tournamentCard.tableFull') : t('tournamentCard.register')}
          </button>
        )
      )}

      {trn.status === 'running' && myEntry?.status === 'playing' && (
        <button
          onClick={onGoToTable}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-emerald-500 to-green-600 text-white"
        >
          {t('tournamentCard.backToTable')}
        </button>
      )}

      {trn.status === 'running' && !myEntry && lateRegOpen && (myBustedCount === 0 || canReenter) && (
        <button
          onClick={onRegister}
          className="w-full py-2 rounded-xl font-bold transition-all bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/30"
        >
          {myBustedCount > 0 ? t('tournamentCard.reenter') : t('tournamentCard.registerLateReg')}
        </button>
      )}

      {isAdmin && trn.status === 'registering' && (
        <>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onForceStart}
              disabled={trn.entries.length < 2}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('tournamentCard.startNow')}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20"
            >
              {t('tournamentCard.cancelTournament')}
            </button>
          </div>
          <div className="flex gap-2 mt-2 items-center">
            <input
              type="number"
              min="1"
              max="50"
              value={botCount}
              onChange={(e) => setBotCount(parseInt(e.target.value, 10) || 1)}
              className="w-14 text-center bg-gray-800 border border-white/10 rounded-lg px-1 py-1.5 text-white text-xs outline-none focus:border-amber-500"
            />
            <button
              onClick={() => onAddBots(botCount)}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20"
            >
              🤖 Добавить тестовых ботов (сливают стек)
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

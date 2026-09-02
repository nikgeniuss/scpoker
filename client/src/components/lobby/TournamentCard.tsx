import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Coins, Users, Zap, Trophy, Ticket, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatMoney } from '../../config/chipFormat';
import { TournamentDetailsModal } from './TournamentDetailsModal';
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
  onRemove: () => void;
  onGoToTable: () => void;
  onAddBots: (count: number) => void;
  onRedeemPromo: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

export const TournamentCard = ({
  tournament: trn, myId, isAdmin, onRegister, onUnregister, onForceStart, onCancel, onRemove, onGoToTable, onAddBots, onRedeemPromo,
}: TournamentCardProps) => {
  const { t, i18n } = useTranslation();
  const [botCount, setBotCount] = useState(3);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  // Клик по завершённой/отменённой карточке — полная сводка (итоги/участники), пока она ещё
  // в списке (автоудаление через 30 минут, см. TournamentManager.scheduleAutoRemove).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isArchived = trn.status === 'finished' || trn.status === 'cancelled';
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
    (trn.unlimitedReEntries || myBustedCount <= (trn.maxReEntries ?? 0));
  const isFull = trn.type === 'sng' && trn.entries.length >= trn.tableSize;
  // MTT: entries.length копится за всю историю (ре-энтри не убирают старую запись, только
  // добавляют новую), а tableSize — вместимость ОДНОГО стола, не всего турнира — сырое
  // entries.length/tableSize вводит в заблуждение (может показывать «10/9»). Считаем реально
  // играющих сейчас относительно суммарной вместимости всех текущих столов турнира.
  const playersCount = trn.type === 'mtt' ? trn.entries.filter((e) => e.status !== 'eliminated').length : trn.entries.length;
  // До старта tableIds ещё пуст (столы не созданы) — реальный потолок регистрации это
  // maxPlayers (если задан админом), а не вместимость одного будущего стола (иначе «20/9»
  // при maxPlayers=33). Без maxPlayers — оцениваем по числу столов, которые создались бы сейчас.
  const mttExpectedTables = trn.tableIds.length > 0 ? trn.tableIds.length : Math.max(1, Math.ceil(playersCount / trn.tableSize));
  const playersCapacity = trn.type === 'mtt' ? (trn.maxPlayers ?? trn.tableSize * mttExpectedTables) : trn.tableSize;
  // Рейк — доля бай-ина мимо призового фонда (см. rakePerEntry в TournamentManager.ts). Показываем
  // игроку разбивку «бай-ин + рейк», как в топовых румах, а не только очищенный призовой фонд.
  const rakeAmount = trn.rakePercent ? Math.floor((trn.buyIn * trn.rakePercent) / 100) : 0;
  const lateRegOpen = isLateRegOpen(trn);
  const regNotOpenYet = isRegNotOpenYet(trn);
  // Показывать «Активировать промо» ровно там же, где доступна обычная регистрация (registering
  // или поздняя рег. MTT) — не привязано к конкретному коду, сервер сам проверит совпадение buyIn.
  const canRedeemPromo = !myEntry && !isFull && (
    (trn.status === 'registering' && !regNotOpenYet) ||
    (trn.status === 'running' && lateRegOpen && (myBustedCount === 0 || canReenter))
  );

  const handlePromoSubmit = async () => {
    const code = promoInput.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    const result = await onRedeemPromo(code);
    setPromoBusy(false);
    if (result.ok) {
      setPromoInput('');
      setPromoOpen(false);
    }
  };

  const copyPromoCode = () => {
    if (!trn.promoCode) return;
    navigator.clipboard?.writeText(trn.promoCode).then(() => toast.success(t('tournamentCard.promoCopied')));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={isArchived ? () => setDetailsOpen(true) : undefined}
      className={
        'relative rounded-2xl px-5 py-4 border bg-gray-900/55 backdrop-blur-md border-white/10 hover:border-amber-500/50 transition-colors ' +
        (isArchived ? 'cursor-pointer' : '')
      }
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
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0 ' +
            (trn.status === 'registering'
              ? 'bg-emerald-500/20 text-emerald-400'
              : trn.status === 'running'
              ? 'bg-red-500/20 text-red-400'
              : trn.status === 'finished'
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-gray-700/40 text-gray-500')
          }
        >
          <span
            className={
              'w-1.5 h-1.5 rounded-full ' +
              (trn.status === 'registering' ? 'bg-emerald-400' : trn.status === 'running' ? 'bg-red-400' : 'bg-gray-400')
            }
          />
          {trn.status === 'registering' ? t('tournamentCard.statusRegistering') : trn.status === 'running' ? t('tournamentCard.statusRunning') : trn.status === 'finished' ? t('tournamentCard.statusFinished') : t('tournamentCard.statusCancelled')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mb-3">
        <span className="inline-flex items-center gap-1">
          <Coins size={11} /> {t('tournamentCard.buyIn')} <span className="text-white font-bold">
            {formatMoney(trn.buyIn - rakeAmount)}{rakeAmount > 0 ? ` + ${formatMoney(rakeAmount)}` : ''}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> <span className="text-amber-400 font-bold">{playersCount}/{playersCapacity}</span>
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
        {isAdmin && !!trn.promoCode && (
          <button
            onClick={(e) => { e.stopPropagation(); copyPromoCode(); }}
            title={t('tournamentCard.promoAdminHint')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-bold hover:bg-sky-500/25"
          >
            <Ticket size={11} /> {trn.promoCode} <Copy size={10} />
          </button>
        )}
        {trn.status === 'registering' && !!trn.scheduledStartAt && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-gray-300">
            {t('tournamentCard.scheduledStart', { time: formatScheduled(trn.scheduledStartAt, i18n.language) })}
          </span>
        )}
      </div>

      {/* Прогресс-бар заполнения (playersCount/playersCapacity) — визуальный язык референса
          компакт-карточек кэш-игр, тот же приём, что в RoomCard.tsx. */}
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-3">
        <div
          className={
            'h-full rounded-full transition-all ' +
            (playersCount >= playersCapacity ? 'bg-red-400' : playersCount / playersCapacity >= 0.5 ? 'bg-amber-400' : 'bg-emerald-400')
          }
          style={{ width: (playersCapacity > 0 ? (playersCount / playersCapacity) * 100 : 0) + '%' }}
        />
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

      {canRedeemPromo && (
        promoOpen ? (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePromoSubmit()}
              placeholder={t('tournamentCard.promoPlaceholder')}
              autoFocus
              className="flex-1 min-w-0 bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-sky-500"
            />
            <button
              onClick={handlePromoSubmit}
              disabled={!promoInput.trim() || promoBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {t('tournamentCard.promoActivate')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPromoOpen(true)}
            className="w-full mt-2 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-sky-300 flex items-center justify-center gap-1.5"
          >
            <Ticket size={12} /> {t('tournamentCard.havePromo')}
          </button>
        )
      )}

      {isAdmin && isArchived && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10"
        >
          {t('tournamentCard.removeFromList')}
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

      {detailsOpen && (
        <TournamentDetailsModal tournament={trn} onClose={() => setDetailsOpen(false)} />
      )}
    </motion.div>
  );
};

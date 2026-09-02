import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trophy, X } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import type { TournamentInfo } from '@poker-room/shared';

interface Props {
  tournament: TournamentInfo | null;
  onClose: () => void;
}

// Полная сводка по завершённому/отменённому турниру — карточка в лобби показывает только топ-3,
// здесь весь список мест + приза, плюс сводка (бай-ин, призовой фонд, длительность, баунти).
// Отменённый турнир — без мест/призов (cancel() только рефандит бай-ины), отдельный, более
// простой вид: сводка + список участников.
export const TournamentDetailsModal = ({ tournament: trn, onClose }: Props) => {
  const { t } = useTranslation();
  if (!trn) return null;

  const rakeAmount = trn.rakePercent ? Math.floor((trn.buyIn * trn.rakePercent) / 100) : 0;
  const finishers = trn.entries
    .filter((e) => e.finishPlace)
    .sort((a, b) => (a.finishPlace ?? 0) - (b.finishPlace ?? 0));
  const bountyTotal = trn.entries.reduce((sum, e) => sum + (e.bountyWon ?? 0), 0);
  const duration =
    trn.startedAt && trn.finishedAt
      ? Math.max(0, trn.finishedAt - trn.startedAt)
      : undefined;
  const durationLabel = duration !== undefined
    ? (() => {
        const totalMin = Math.round(duration / 60_000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? t('tournamentDetailsModal.durationHours', { h, m }) : t('tournamentDetailsModal.durationMinutes', { m });
      })()
    : null;

  // Portal в document.body: карточка-хост (TournamentCard) — motion.div с animate (transform),
  // что создаёт containing block для fixed-потомков — без портала оверлей был бы «заперт»
  // внутри карточки вместо полноэкранного (тот же паттерн, что в CreateTournamentModal.tsx).
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[85dvh] flex flex-col bg-gradient-to-b from-gray-900 to-black border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-900/30 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-transparent shrink-0">
            <h2 className="text-white font-bold text-base flex items-center gap-2 min-w-0">
              <Trophy size={18} className="text-amber-400 shrink-0" />
              <span className="truncate">{trn.name}</span>
            </h2>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto px-4 py-4 space-y-4">
            <div className="text-amber-300/80 text-xs font-bold uppercase tracking-widest">
              {trn.status === 'cancelled' ? t('tournamentDetailsModal.titleCancelled') : t('tournamentDetailsModal.title')}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="text-gray-400">{t('tournamentCard.buyIn')}</div>
              <div className="text-white font-bold text-right">
                {formatMoney(trn.buyIn - rakeAmount)}{rakeAmount > 0 ? ` + ${formatMoney(rakeAmount)}` : ''}
              </div>

              <div className="text-gray-400">{t('tournamentDetailsModal.entriesTotal')}</div>
              <div className="text-white font-bold text-right">{trn.entries.length}</div>

              {trn.status !== 'cancelled' && (
                <>
                  <div className="text-gray-400">{t('tournamentCard.prizePool')}</div>
                  <div className="text-emerald-400 font-bold text-right">{formatMoney(trn.prizePool)}</div>
                </>
              )}

              {!!trn.overlayPaid && (
                <>
                  <div className="text-gray-400">{t('tournamentCard.overlay')}</div>
                  <div className="text-amber-400 font-bold text-right">{formatMoney(trn.overlayPaid)}</div>
                </>
              )}

              {bountyTotal > 0 && (
                <>
                  <div className="text-gray-400">{t('tournamentDetailsModal.bountyTotal')}</div>
                  <div className="text-red-300 font-bold text-right">{formatMoney(bountyTotal)}</div>
                </>
              )}

              {durationLabel && (
                <>
                  <div className="text-gray-400">{t('tournamentDetailsModal.duration')}</div>
                  <div className="text-white font-bold text-right">{durationLabel}</div>
                </>
              )}
            </div>

            {trn.status === 'cancelled' ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">{t('tournamentDetailsModal.cancelledRefunded')}</p>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  {t('tournamentDetailsModal.participants')}
                </div>
                <div className="space-y-1 text-sm text-gray-300">
                  {trn.entries.map((e, i) => (
                    <div key={e.userId + i}>{e.username}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  {t('tournamentDetailsModal.standings')}
                </div>
                <div className="space-y-1">
                  {finishers.map((e) => (
                    <div key={e.userId + '-' + e.finishPlace} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300 truncate">{e.finishPlace}. {e.username}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {!!e.bountyWon && <span className="text-red-300 font-bold text-xs">🎯 +{formatMoney(e.bountyWon)}</span>}
                        {!!e.prize && <span className="text-emerald-400 font-bold">{formatMoney(e.prize)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/10 bg-black/30 shrink-0">
            <button
              onClick={onClose}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-bold"
            >
              {t('tournamentDetailsModal.close')}
            </button>
          </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

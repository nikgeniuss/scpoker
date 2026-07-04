import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trophy, Award, X } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import type { TournamentResultPayload } from '@poker-room/shared';

interface Props {
  result: TournamentResultPayload | null;
  onClose: () => void;
  onReEnter: (tournamentId: string) => void;
}

// Результат турнира (победа/выбывание) — поверх любой страницы (монтируется в Layout), в стиле
// турнирных карточек лобби (золото/трофей). Сервер шлёт это ДО того, как стол закрывается —
// раньше стол молча пропадал, и клиент узнавал о завершении только через ошибку not-found.
// reEntryFee задан — предлагаем зайти заново тут же (как в PokerStars/GGPoker), не заставляя
// искать кнопку в лобби турниров.
export const TournamentResultModal = ({ result, onClose, onReEnter }: Props) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-gradient-to-b from-gray-900 to-black border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-900/30 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-transparent">
              <h2 className="text-white font-bold text-base flex items-center gap-2">
                {result.isWinner
                  ? <Trophy size={18} className="text-amber-400" />
                  : <Award size={18} className="text-amber-400" />}
                {result.isWinner ? t('tournamentResult.titleWin') : t('tournamentResult.titleFinish')}
              </h2>
              <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 text-center">
              <div className="text-amber-300/80 text-xs font-bold uppercase tracking-widest mb-1 truncate">
                {result.tournamentName}
              </div>

              {result.isWinner ? (
                <div className="my-4">
                  <div className="text-5xl mb-2">🏆</div>
                  <div className="text-white text-lg font-bold">
                    {t('tournamentResult.winnerOf', { count: result.totalEntries })}
                  </div>
                </div>
              ) : (
                <div className="my-4">
                  <div className="text-4xl font-black text-white">
                    {result.place}<span className="text-white/40 text-2xl">/{result.totalEntries}</span>
                  </div>
                  <div className="text-white/50 text-sm mt-1">{t('tournamentResult.place')}</div>
                </div>
              )}

              <div className="mt-3">
                {result.prize ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-emerald-300 text-xs font-bold uppercase">{t('tournamentResult.prize')}</span>
                    <span className="text-emerald-400 font-black text-lg">{formatMoney(result.prize)}</span>
                  </div>
                ) : (
                  <div className="text-white/40 text-sm">{t('tournamentResult.noPrize')}</div>
                )}
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-black/30">
              {result.reEntryFee !== undefined && (
                <button
                  onClick={() => onReEnter(result.tournamentId)}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold"
                >
                  {t('tournamentResult.reEnter', { fee: formatMoney(result.reEntryFee) })}
                </button>
              )}
              <button
                onClick={onClose}
                className={
                  'flex-1 min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold ' +
                  (result.reEntryFee !== undefined
                    ? 'bg-white/5 hover:bg-white/10 text-white/80'
                    : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white')
                }
              >
                {t('tournamentResult.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

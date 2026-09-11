import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Info, X } from 'lucide-react';
import { formatMoney } from '../../config/chipFormat';
import { API_URL } from '../../config/api';
import { useAuthStore } from '../../store/authStore';
import type { TournamentInfo, TournamentStructure } from '@poker-room/shared';

// Строка «подпись — значение» в двухколоночной сетке.
const Row = ({ label, value }: { label: string; value: string }) => (
  <>
    <div className="text-gray-400">{label}</div>
    <div className="text-white font-bold text-right">{value}</div>
  </>
);

interface Props {
  tournament: TournamentInfo | null;
  onClose: () => void;
}

// Структура турнира ДО регистрации (§10.19): условия входа, стек и блайнды, правила и разбивка
// призовых по местам. Итоги завершённого турнира — отдельная TournamentDetailsModal (там места,
// призы и баунти по факту); здесь наоборот — то, по чему игрок решает, заходить ли.
export const TournamentInfoModal = ({ tournament: trn, onClose }: Props) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [structure, setStructure] = useState<TournamentStructure | null>(null);

  // Разбивку по местам считает сервер (тот же расчёт, что и на выплате) — на клиенте её не
  // дублируем, иначе предпросмотр разъедется с реальными выплатами.
  useEffect(() => {
    if (!trn || !token) return;
    let cancelled = false;
    fetch(API_URL + '/tournaments/' + trn.id + '/structure', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TournamentStructure | null) => {
        if (!cancelled) setStructure(data);
      })
      .catch(() => {
        if (!cancelled) setStructure(null);
      });
    return () => { cancelled = true; };
  }, [trn, token]);

  if (!trn) return null;

  const rakeAmount = trn.rakePercent ? Math.floor((trn.buyIn * trn.rakePercent) / 100) : 0;
  // Пока банк пуст (никто не зарегистрировался), сервер отдаёт места с нулевыми суммами —
  // показывать столбик нулей смысла нет, ниже подпись «разбивка появится».
  const places = structure && structure.prizePool > 0
    ? Object.keys(structure.payout).map(Number).sort((a, b) => a - b)
    : [];

  const speedKey: Record<TournamentInfo['blindSpeed'], string> = {
    slow: 'tournamentCard.speedSlow',
    regular: 'tournamentCard.speedRegular',
    turbo: 'tournamentCard.speedTurbo',
    hyper: 'tournamentCard.speedHyper',
  };

  // Portal в document.body — карточка-хост анимируется через transform и иначе «заперла» бы
  // fixed-оверлей внутри себя (тот же паттерн, что в TournamentDetailsModal).
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
        className="w-full max-w-md max-h-[85dvh] flex flex-col bg-gradient-to-b from-gray-900 to-black border border-sky-500/30 rounded-2xl shadow-2xl shadow-sky-900/30 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-sky-500/10 to-transparent shrink-0">
          <h2 className="text-white font-bold text-base flex items-center gap-2 min-w-0">
            <Info size={18} className="text-sky-400 shrink-0" />
            <span className="truncate">{trn.name}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label={t('tournamentInfoModal.close')}
            className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <section>
            <div className="text-sky-300/80 text-xs font-bold uppercase tracking-widest mb-2">
              {t('tournamentInfoModal.sectionEntry')}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row
                label={t('tournamentCard.buyIn')}
                value={
                  trn.buyIn === 0
                    ? t('tournamentInfoModal.freeroll')
                    : formatMoney(trn.buyIn - rakeAmount) + (rakeAmount > 0 ? ` + ${formatMoney(rakeAmount)}` : '')
                }
              />
              <Row label={t('tournamentInfoModal.type')} value={trn.type === 'mtt' ? 'MTT' : 'SNG'} />
              <Row
                label={t('tournamentInfoModal.format')}
                value={trn.format === 'shortdeck' ? t('tournamentInfoModal.formatShortdeck') : t('tournamentInfoModal.formatNlh')}
              />
              <Row label={t('tournamentInfoModal.tableSize')} value={String(trn.tableSize)} />
              {trn.type === 'mtt' && trn.lateRegMinutes > 0 && (
                <Row
                  label={t('tournamentInfoModal.lateReg')}
                  value={t('tournamentInfoModal.minutes', { m: trn.lateRegMinutes })}
                />
              )}
              {trn.reEntryEnabled && (
                <Row
                  label={t('tournamentInfoModal.reEntry')}
                  value={
                    trn.unlimitedReEntries
                      ? t('tournamentInfoModal.reEntryUnlimited')
                      : t('tournamentInfoModal.reEntryLimited', { n: trn.maxReEntries ?? 0 })
                  }
                />
              )}
              {trn.bountyEnabled && !!trn.bountyPercent && (
                <Row label={t('tournamentInfoModal.bounty')} value={`${trn.bountyPercent}%`} />
              )}
            </div>
          </section>

          <section>
            <div className="text-sky-300/80 text-xs font-bold uppercase tracking-widest mb-2">
              {t('tournamentInfoModal.sectionStructure')}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label={t('tournamentInfoModal.startingStack')} value={formatMoney(trn.startingStack)} />
              <Row label={t('tournamentInfoModal.startingBlind')} value={formatMoney(trn.startingBigBlind)} />
              <Row label={t('tournamentInfoModal.speed')} value={t(speedKey[trn.blindSpeed])} />
              <Row
                label={t('tournamentInfoModal.levelLength')}
                value={t('tournamentInfoModal.minutes', { m: trn.levelUpMinutes })}
              />
            </div>
          </section>

          <section>
            <div className="text-sky-300/80 text-xs font-bold uppercase tracking-widest mb-2">
              {t('tournamentInfoModal.sectionPrizes')}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label={t('tournamentCard.prizePool')} value={formatMoney(trn.prizePool)} />
              {!!trn.guaranteedPrizePool && (
                <Row label={t('tournamentCard.guarantee')} value={formatMoney(trn.guaranteedPrizePool)} />
              )}
              <Row label={t('tournamentInfoModal.entriesNow')} value={String(trn.entries.length)} />
            </div>

            {places.length > 0 ? (
              <div className="mt-3 space-y-1">
                {places.map((place) => (
                  <div key={place} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{t('tournamentInfoModal.place', { place })}</span>
                    <span className="text-emerald-400 font-bold">{formatMoney(structure!.payout[place])}</span>
                  </div>
                ))}
                <p className="text-gray-500 text-[11px] pt-1">{t('tournamentInfoModal.payoutNote')}</p>
              </div>
            ) : (
              <p className="text-gray-500 text-xs mt-3">{t('tournamentInfoModal.payoutEmpty')}</p>
            )}
          </section>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
};

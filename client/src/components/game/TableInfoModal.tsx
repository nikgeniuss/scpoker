import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Coins, Clock, Users, Lock, Info, Hash, Trophy, Layers } from 'lucide-react';
import { API_URL } from '../../config/api';
import { formatChips, formatMoney } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
// RoomMeta — это публичный RoomInfo из общего контракта shared (модалка читает подмножество полей).
import type { RoomInfo as RoomMeta, TournamentStandings } from '@poker-room/shared';
import type { TFunction } from 'i18next';
import { useBlindLevelCountdown } from '../../hooks/useBlindLevelCountdown';
import { useAuthStore } from '../../store/authStore';

interface WinnerEntry {
  t: number;
  winners: { id: string; username: string; amount: number }[];
  handName?: string;
}

// Вынесено за пределы компонента — вызов Date.now() внутри тела рендера напрямую запрещён
// (React Compiler lint, "impure function during render"); функция вне компонента не анализируется.
function isFutureTimestamp(ts: number | null | undefined): ts is number {
  return typeof ts === 'number' && ts > Date.now();
}

function timeAgo(ts: number, t: TFunction, lang: string): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return t('tableInfoModal.timeJustNow');
  if (diff < 3600) return t('tableInfoModal.timeMinAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('tableInfoModal.timeHourAgo', { count: Math.floor(diff / 3600) });
  return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU');
}

interface Props {
  open: boolean;
  roomId: string;
  myChips: number;
  myCurrentBet: number;
  displayMode: ChipDisplay;
  tournamentId?: string;
  myId?: string | null;
  // Турнирный HUD стола (§10.19): когда поднимутся блайнды и до какого BB — те же значения, что
  // в плашке под общими картами, здесь рядом с остальной турнирной сводкой.
  tournamentNextLevelAt?: number;
  tournamentNextBigBlind?: number;
  onClose: () => void;
}

// Живой рэнкинг за столом обновляется поллингом, пока модалка открыта (турнир меняется постоянно —
// новые фишки/выбывания), тот же интервал, что у tournamentStore в лобби (ROADMAP §10.19).
const STANDINGS_POLL_MS = 5000;

export const TableInfoModal = ({
  open,
  roomId,
  myChips,
  myCurrentBet,
  displayMode,
  tournamentId,
  myId,
  tournamentNextLevelAt,
  tournamentNextBigBlind,
  onClose,
}: Props) => {
  const { t, i18n } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [winners, setWinners] = useState<WinnerEntry[]>([]);
  const [standings, setStandings] = useState<TournamentStandings | null>(null);

  useEffect(() => {
    if (!open) return;
    setRoom(null);
    setLoadError(null);
    setWinners([]);
    fetch(API_URL + '/rooms/' + roomId)
      .then((r) => (r.ok ? r.json() : Promise.reject('http ' + r.status)))
      .then((data: RoomMeta) => setRoom(data))
      .catch((e) => setLoadError(String(e)));
    fetch(API_URL + '/rooms/' + roomId + '/winners')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WinnerEntry[]) => setWinners(data))
      .catch(() => {});
  }, [open, roomId]);

  useEffect(() => {
    if (!open || !tournamentId || !token) {
      setStandings(null);
      return;
    }
    const load = () =>
      fetch(API_URL + '/tournaments/' + tournamentId + '/standings', {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: TournamentStandings | null) => setStandings(data))
        .catch(() => {});
    load();
    const id = setInterval(load, STANDINGS_POLL_MS);
    return () => clearInterval(id);
  }, [open, tournamentId, token]);

  const lateRegLeft = useBlindLevelCountdown(
    isFutureTimestamp(standings?.lateRegClosesAt) ? standings.lateRegClosesAt : undefined,
  );
  const blindsRiseIn = useBlindLevelCountdown(tournamentNextLevelAt);
  const myPlace = myId ? standings?.entries.find((e) => e.userId === myId)?.place : undefined;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-noswipe
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-white font-bold text-base flex items-center gap-2">
                <Info size={16} className="text-emerald-400" />
                {t('tableInfoModal.title')}
              </h2>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {!room && !loadError && (
                <div className="text-sm text-gray-400 py-6 text-center">{t('tableInfoModal.loading')}</div>
              )}
              {loadError && (
                <div className="text-sm text-red-400 py-4 text-center">
                  {t('tableInfoModal.loadError')}
                </div>
              )}

              {room && (
                <>
                  <Section title={t('tableInfoModal.sectionMain')}>
                    <Row label={t('tableInfoModal.name')} value={room.name} />
                    {room.description && (
                      <Row label={t('tableInfoModal.description')} value={room.description} multiline />
                    )}
                    <Row label={t('tableInfoModal.gameType')} value={room.format === 'shortdeck' ? t('tableInfoModal.shortDeck') : t('tableInfoModal.holdem')} />
                    <Row
                      label={t('tableInfoModal.blinds')}
                      value={formatMoney(room.smallBlind) + ' / ' + formatMoney(room.bigBlind)}
                    />
                    <Row
                      label={t('tableInfoModal.createdBy')}
                      value={room.createdBy}
                    />
                    <Row
                      label={t('tableInfoModal.players')}
                      value={t('tableInfoModal.playersOf', { current: room.currentPlayers, max: room.maxPlayers })}
                      icon={<Users size={12} />}
                    />
                    <Row
                      label={t('tableInfoModal.status')}
                      value={room.status === 'playing' ? t('tableInfoModal.statusPlaying') : t('tableInfoModal.statusWaiting')}
                    />
                    {room.hasPassword && (
                      <Row
                        label={t('tableInfoModal.access')}
                        value={t('tableInfoModal.accessPrivate')}
                        icon={<Lock size={12} className="text-yellow-400" />}
                      />
                    )}
                  </Section>

                  <Section title={t('tableInfoModal.sectionParams')}>
                    <Row
                      label={t('tableInfoModal.buyIn')}
                      value={
                        room.buyInMinBb + '-' + room.buyInMaxBb + ' BB (' +
                        formatMoney(room.bigBlind * room.buyInMinBb) + '-' +
                        formatMoney(room.bigBlind * room.buyInMaxBb) + ')'
                      }
                      icon={<Coins size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label={t('tableInfoModal.turnTime')}
                      value={t('tableInfoModal.turnTimeSec', { sec: room.turnDurationSec })}
                      icon={<Clock size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label={t('tableInfoModal.rake')}
                      value={
                        room.rake.percent > 0
                          ? t('tableInfoModal.rakeWithCap', { percent: room.rake.percent, cap: room.rake.capBb })
                          : t('tableInfoModal.noRake')
                      }
                      icon={<Coins size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label={t('tableInfoModal.tableId')}
                      value={room.id}
                      icon={<Hash size={12} className="text-white/40" />}
                      mono
                    />
                  </Section>

                  {tournamentId && standings && (
                    <Section title={t('tableInfoModal.sectionTournament')}>
                      <Row
                        label={t('tableInfoModal.tournamentPlace')}
                        value={
                          myPlace
                            ? t('tableInfoModal.tournamentPlaceValue', { place: myPlace, total: standings.playersRemaining })
                            : '—'
                        }
                        icon={<Trophy size={12} className="text-amber-400" />}
                      />
                      <Row
                        label={t('tableInfoModal.tournamentPlayersLeft')}
                        value={t('tableInfoModal.tournamentPlayersLeftValue', {
                          remaining: standings.playersRemaining,
                          total: standings.totalEntries,
                        })}
                        icon={<Users size={12} className="text-amber-400" />}
                      />
                      <Row
                        label={t('tableInfoModal.tournamentPrizePool')}
                        value={formatMoney(standings.prizePool)}
                        icon={<Coins size={12} className="text-amber-400" />}
                      />
                      <Row label={t('tableInfoModal.tournamentPaidPlaces')} value={String(standings.paidPlaces)} />
                      {standings.playersRemaining > 0 && (
                        <Row
                          label={t('tableInfoModal.tournamentAvgStack')}
                          value={formatMoney(
                            Math.round(
                              standings.entries.reduce((sum, e) => sum + e.chips, 0) / standings.playersRemaining,
                            ),
                          )}
                          icon={<Layers size={12} className="text-amber-400" />}
                        />
                      )}
                      {blindsRiseIn && tournamentNextBigBlind !== undefined && (
                        <Row
                          label={t('tableInfoModal.tournamentNextLevel')}
                          value={t('tableInfoModal.tournamentNextLevelValue', {
                            time: blindsRiseIn,
                            bb: formatMoney(tournamentNextBigBlind),
                          })}
                          icon={<Clock size={12} className="text-amber-400" />}
                        />
                      )}
                      {lateRegLeft && (
                        <Row
                          label={t('tableInfoModal.tournamentLateReg')}
                          value={lateRegLeft}
                          icon={<Clock size={12} className="text-amber-400" />}
                        />
                      )}

                      <div className="pt-1">
                        <div className="text-white/40 text-[11px] mb-1.5">{t('tableInfoModal.tournamentPayouts')}</div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {Object.entries(standings.payout)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([place, prize]) => (
                              <div
                                key={place}
                                className={
                                  'flex justify-between text-xs ' +
                                  (Number(place) === myPlace ? 'text-amber-300 font-bold' : 'text-white/60')
                                }
                              >
                                <span>#{place}</span>
                                <span>{formatMoney(prize)}</span>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="text-white/40 text-[11px] mb-1.5">{t('tableInfoModal.tournamentLeaderboard')}</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                          {standings.entries.map((e) => (
                            <div
                              key={e.userId}
                              className={
                                'flex justify-between text-xs ' +
                                (e.userId === myId ? 'text-amber-300 font-bold' : 'text-white/60')
                              }
                            >
                              <span className="truncate">
                                {e.place}. {e.username}
                                {e.userId === myId ? ' ' + t('tableInfoModal.tournamentMe') : ''}
                              </span>
                              <span className="shrink-0">{formatChips(e.chips, room.bigBlind, displayMode)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Section>
                  )}

                  <Section title={t('tableInfoModal.sectionMine')}>
                    <Row
                      label={t('tableInfoModal.myStack')}
                      value={formatChips(myChips, room.bigBlind, displayMode)}
                    />
                    {myCurrentBet > 0 && (
                      <Row
                        label={t('tableInfoModal.myBet')}
                        value={formatChips(myCurrentBet, room.bigBlind, displayMode)}
                      />
                    )}
                  </Section>

                  {winners.length > 0 && (
                    <Section title={t('tableInfoModal.sectionWinners')}>
                      <div className="space-y-2">
                        {winners.map((w, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="text-white font-semibold truncate">
                                {w.winners.map((p) => p.username).join(', ')}
                              </div>
                              <div className="text-white/40 text-[11px]">
                                {w.handName ?? t('tableInfoModal.noShowdown')} · {timeAgo(w.t, t, i18n.language)}
                              </div>
                            </div>
                            <span className="text-emerald-400 font-bold shrink-0 tabular-nums">
                              +{formatChips(w.winners.reduce((sum, p) => sum + p.amount, 0), room.bigBlind, displayMode)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-black/30">
              <button
                onClick={onClose}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-bold"
              >
                {t('tableInfoModal.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-2">
      {title}
    </h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Row = ({
  label,
  value,
  icon,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  multiline?: boolean;
}) => (
  <div className="flex items-start justify-between gap-3 text-sm">
    <span className="text-white/50 shrink-0">{label}</span>
    <span
      className={
        'text-white text-right ' +
        (mono ? 'font-mono text-xs ' : 'font-semibold ') +
        (multiline ? 'whitespace-normal break-words' : 'truncate min-w-0') +
        ' flex items-center gap-1.5 justify-end'
      }
    >
      {icon}
      {value}
    </span>
  </div>
);

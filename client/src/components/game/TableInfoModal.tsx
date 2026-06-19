import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Clock, Users, Lock, Info, Hash } from 'lucide-react';
import { API_URL } from '../../config/api';
import { formatChips, formatMoney } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
// RoomMeta — это публичный RoomInfo из общего контракта shared (модалка читает подмножество полей).
import type { RoomInfo as RoomMeta } from '@poker-room/shared';

interface WinnerEntry {
  t: number;
  winners: { id: string; username: string; amount: number }[];
  handName?: string;
}

function timeAgo(t: number): string {
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  return new Date(t).toLocaleDateString('ru-RU');
}

interface Props {
  open: boolean;
  roomId: string;
  myChips: number;
  myCurrentBet: number;
  displayMode: ChipDisplay;
  onClose: () => void;
}

export const TableInfoModal = ({
  open,
  roomId,
  myChips,
  myCurrentBet,
  displayMode,
  onClose,
}: Props) => {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [winners, setWinners] = useState<WinnerEntry[]>([]);

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
                Информация о столе
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
                <div className="text-sm text-gray-400 py-6 text-center">Загрузка…</div>
              )}
              {loadError && (
                <div className="text-sm text-red-400 py-4 text-center">
                  Не удалось загрузить информацию.
                </div>
              )}

              {room && (
                <>
                  <Section title="Основное">
                    <Row label="Название" value={room.name} />
                    {room.description && (
                      <Row label="Описание" value={room.description} multiline />
                    )}
                    <Row label="Вид игры" value={room.format === 'shortdeck' ? 'Шорт-дэк (Short Deck)' : "No Limit Hold'em"} />
                    <Row
                      label="Блайнды"
                      value={formatMoney(room.smallBlind) + ' / ' + formatMoney(room.bigBlind)}
                    />
                    <Row
                      label="Создатель"
                      value={room.createdBy}
                    />
                    <Row
                      label="Игроков"
                      value={room.currentPlayers + ' из ' + room.maxPlayers}
                      icon={<Users size={12} />}
                    />
                    <Row
                      label="Статус"
                      value={room.status === 'playing' ? 'Раздача идёт' : 'Ожидание'}
                    />
                    {room.hasPassword && (
                      <Row
                        label="Доступ"
                        value="приватный (с паролем)"
                        icon={<Lock size={12} className="text-yellow-400" />}
                      />
                    )}
                  </Section>

                  <Section title="Параметры">
                    <Row
                      label="Бай-ин"
                      value={
                        room.buyInMinBb + '-' + room.buyInMaxBb + ' BB (' +
                        formatMoney(room.bigBlind * room.buyInMinBb) + '-' +
                        formatMoney(room.bigBlind * room.buyInMaxBb) + ')'
                      }
                      icon={<Coins size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label="Время на ход"
                      value={room.turnDurationSec + ' сек'}
                      icon={<Clock size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label="Рейк"
                      value={
                        room.rake.percent > 0
                          ? room.rake.percent + '% (cap ' + room.rake.capBb + ' BB)'
                          : 'без рейка'
                      }
                      icon={<Coins size={12} className="text-emerald-400" />}
                    />
                    <Row
                      label="ID стола"
                      value={room.id}
                      icon={<Hash size={12} className="text-white/40" />}
                      mono
                    />
                  </Section>

                  <Section title="Моё на столе">
                    <Row
                      label="Текущий стек"
                      value={formatChips(myChips, room.bigBlind, displayMode)}
                    />
                    {myCurrentBet > 0 && (
                      <Row
                        label="В банке от меня"
                        value={formatChips(myCurrentBet, room.bigBlind, displayMode)}
                      />
                    )}
                  </Section>

                  {winners.length > 0 && (
                    <Section title="История победителей">
                      <div className="space-y-2">
                        {winners.map((w, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="text-white font-semibold truncate">
                                {w.winners.map((p) => p.username).join(', ')}
                              </div>
                              <div className="text-white/40 text-[11px]">
                                {w.handName ?? 'без вскрытия'} · {timeAgo(w.t)}
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
                Закрыть
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

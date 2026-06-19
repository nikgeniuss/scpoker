import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ReactNiceAvatar from 'react-nice-avatar';
import { avatarConfig } from '../../utils/avatar';
import { avatarColor } from './seatColors';
import type { PlayerView } from './PlayerSeat';

const NOTE_MAX_LEN = 300;

interface PlayerInfoPopupProps {
  player: PlayerView | null;
  note: string;
  onNoteChange: (text: string) => void;
  onClose: () => void;
}

export const PlayerInfoPopup = ({ player, note, onNoteChange, onClose }: PlayerInfoPopupProps) => {
  // Локальный draft — синхронизируется при смене игрока, сохраняется по blur (не на каждый keystroke).
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note, player?.id]);

  return (
    <AnimatePresence>
      {player && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="popup"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-5"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center gap-3">
              {/* Аватар */}
              <div
                className={
                  'w-16 h-16 rounded-full bg-gradient-to-br ' +
                  avatarColor(player.username) +
                  ' shadow-lg overflow-hidden'
                }
              >
                <ReactNiceAvatar
                  className="w-full h-full"
                  shape="circle"
                  {...avatarConfig(player.avatar || player.id)}
                />
              </div>

              {/* Имя */}
              <div className="text-center">
                <div className="text-white font-bold text-lg leading-tight">
                  {player.displayName ?? player.username}
                </div>
                {player.displayName && (
                  <div className="text-gray-500 text-xs mt-0.5">@{player.username}</div>
                )}
              </div>

              {/* HUD-статистика */}
              {player.hudStats && player.hudStats.hands >= 10 ? (
                <div className="w-full bg-black/40 rounded-xl p-3 space-y-2">
                  <div className="text-xs text-gray-400 text-center font-bold uppercase tracking-wide mb-1">
                    HUD ({player.hudStats.hands} рук)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center">
                      <div className="text-poker-gold text-xl font-bold">{player.hudStats.vpip}%</div>
                      <div className="text-gray-500 text-xs">VPIP</div>
                    </div>
                    <div className="text-center">
                      <div className="text-blue-400 text-xl font-bold">{player.hudStats.pfr}%</div>
                      <div className="text-gray-500 text-xs">PFR</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-black/40 rounded-xl p-3 text-center text-gray-500 text-xs">
                  {player.hudStats
                    ? `Недостаточно данных (${player.hudStats.hands} рук)`
                    : 'Нет данных HUD'}
                </div>
              )}

              {/* Заметка — приватная, видна только мне */}
              <div className="w-full">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LEN))}
                  onBlur={() => {
                    if (draft !== note) onNoteChange(draft);
                  }}
                  placeholder="Заметка (видна только вам)"
                  rows={2}
                  maxLength={NOTE_MAX_LEN}
                  className="w-full bg-black/40 rounded-xl p-3 text-sm text-white placeholder:text-gray-500 resize-none outline-none focus:ring-1 focus:ring-poker-gold/60"
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

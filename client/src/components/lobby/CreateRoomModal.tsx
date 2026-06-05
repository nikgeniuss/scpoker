import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTimebankConfig } from '../../hooks/useTimebankConfig';
import type { CreateRoomOptions as CreateOptions, TimebankConfig } from '@poker-room/shared';

// Пресеты блайндов по уровням ставок (см. roadmap 10.6)
const BLIND_PRESETS = [
  { id: 'micro', label: 'Микро', sb: 1, bb: 2 },
  { id: 'low', label: 'Низкие', sb: 5, bb: 10 },
  { id: 'mid', label: 'Средние', sb: 25, bb: 50 },
  { id: 'high', label: 'Высокие', sb: 100, bb: 200 },
] as const;

// Пресеты времени хода (по ClubGG) — см. roadmap 10.6
const TURN_DURATION_PRESETS_SEC = [13, 15, 18, 20, 25] as const;
const DEFAULT_TURN_DURATION_SEC = 20;
const DEFAULT_BUYIN_MIN_BB = 20;
const DEFAULT_BUYIN_MAX_BB = 100;

interface CreateRoomModalProps {
  onClose: () => void;
  onSubmit: (opts: CreateOptions) => void;
}

export const CreateRoomModal = ({ onClose, onSubmit }: CreateRoomModalProps) => {
  const [name, setName] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [description, setDescription] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [turnDurationSec, setTurnDurationSec] = useState<number>(DEFAULT_TURN_DURATION_SEC);
  const [buyInMinBb, setBuyInMinBb] = useState<number>(DEFAULT_BUYIN_MIN_BB);
  const [buyInMaxBb, setBuyInMaxBb] = useState<number>(DEFAULT_BUYIN_MAX_BB);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');

  // Глобальный конфиг таймбанка — разрешена ли per-table настройка + дефолтные значения секции.
  const { tbLocal, setTbLocal, showTimebank } = useTimebankConfig();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error('Название от 3 символов');
      return;
    }
    if (isPrivate && password.length < 4) {
      toast.error('Пароль от 4 символов');
      return;
    }
    if (buyInMinBb < 5 || buyInMinBb > 1000) {
      toast.error('Минимальный бай-ин — от 5 до 1000 BB');
      return;
    }
    if (buyInMaxBb < buyInMinBb || buyInMaxBb > 1000) {
      toast.error('Максимальный бай-ин — от минимального до 1000 BB');
      return;
    }
    const descTrimmed = description.trim();
    if (descTrimmed.length > 200) {
      toast.error('Описание — не больше 200 символов');
      return;
    }
    // Timebank: если глобально разрешён override и секция отрендерена — шлём конфиг.
    // Сервер сам отвалидирует и применит / проигнорирует.
    let timebankToSend: TimebankConfig | undefined;
    if (showTimebank && tbLocal) {
      if (tbLocal.capSec < tbLocal.startSec) {
        toast.error('Cap таймбанка не может быть меньше стартового запаса');
        return;
      }
      timebankToSend = { ...tbLocal };
    }

    onSubmit({
      name: name.trim(),
      description: showDescription && descTrimmed.length > 0 ? descTrimmed : undefined,
      smallBlind,
      bigBlind,
      maxPlayers,
      turnDurationSec,
      buyInMinBb,
      buyInMaxBb,
      password: isPrivate ? password : undefined,
      timebank: timebankToSend,
    });
  };

  // Активный пресет блайндов (если SB/BB точно совпадают с одним из пресетов)
  const activePresetId = BLIND_PRESETS.find((p) => p.sb === smallBlind && p.bb === bigBlind)?.id ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-emerald-500/30 rounded-3xl p-6 w-full max-w-md"
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-2xl font-bold text-white">Новая комната</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: VIP стол"
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={showDescription}
                onChange={(e) => setShowDescription(e.target.checked)}
                className="accent-emerald-500"
              />
              Описание
            </label>
            {showDescription && (
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="Короткое описание стола (видно в лобби)"
                  className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-emerald-500 resize-none"
                />
                <div className="text-right text-[11px] text-gray-500 mt-0.5">{description.length}/200</div>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Уровень блайндов</label>
            <div className="flex flex-wrap gap-2">
              {BLIND_PRESETS.map((p) => {
                const active = activePresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSmallBlind(p.sb);
                      setBigBlind(p.bb);
                    }}
                    className={
                      'px-3 py-1.5 rounded-lg text-sm font-bold transition-all border ' +
                      (active
                        ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                        : 'bg-gray-800 border-white/10 text-gray-300 hover:border-emerald-500/40')
                    }
                  >
                    {p.label} <span className="opacity-70">{p.sb}/{p.bb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Малый блайнд</label>
              <input
                type="number"
                min={1}
                value={smallBlind}
                onChange={(e) => setSmallBlind(Number(e.target.value))}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Большой блайнд</label>
              <input
                type="number"
                min={2}
                value={bigBlind}
                onChange={(e) => setBigBlind(Number(e.target.value))}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">
              Макс. игроков: <span className="text-white">{maxPlayers}</span>
            </label>
            <input
              type="range"
              min={2}
              max={9}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Время на ход: <span className="text-white">{turnDurationSec} сек</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TURN_DURATION_PRESETS_SEC.map((sec) => {
                const active = turnDurationSec === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTurnDurationSec(sec)}
                    className={
                      'px-3 py-1.5 rounded-lg text-sm font-bold transition-all border ' +
                      (active
                        ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                        : 'bg-gray-800 border-white/10 text-gray-300 hover:border-emerald-500/40')
                    }
                  >
                    {sec}с
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Бай-ин мин (BB)</label>
              <input
                type="number"
                min={5}
                max={1000}
                value={buyInMinBb}
                onChange={(e) => setBuyInMinBb(Number(e.target.value))}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Бай-ин макс (BB)</label>
              <input
                type="number"
                min={buyInMinBb}
                max={1000}
                value={buyInMaxBb}
                onChange={(e) => setBuyInMaxBb(Number(e.target.value))}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {showTimebank && tbLocal && (
            <div className="bg-black/30 border border-white/10 rounded-2xl p-3 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={tbLocal.enabled}
                  onChange={(e) => setTbLocal({ ...tbLocal, enabled: e.target.checked })}
                  className="accent-emerald-500"
                />
                <span className="font-bold">Таймбанк</span>
                <span className="text-xs text-gray-400">
                  (резервные секунды поверх обычного хода)
                </span>
              </label>

              {tbLocal.enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Старт (сек)</label>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={tbLocal.startSec}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)));
                        setTbLocal({ ...tbLocal, startSec: v });
                      }}
                      className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Cap (сек)</label>
                    <input
                      type="number"
                      min={tbLocal.startSec}
                      max={600}
                      value={tbLocal.capSec}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)));
                        setTbLocal({ ...tbLocal, capSec: v });
                      }}
                      className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Бонус (сек)</label>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={tbLocal.bonusSec}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)));
                        setTbLocal({ ...tbLocal, bonusSec: v });
                      }}
                      className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Раз в (рук)</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={tbLocal.bonusEveryHands}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(1000, Math.round(Number(e.target.value) || 1)));
                        setTbLocal({ ...tbLocal, bonusEveryHands: v });
                      }}
                      className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="accent-emerald-500"
            />
            Приватная (с паролем)
          </label>

          {isPrivate && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-emerald-500"
            />
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 font-bold text-white shadow-lg shadow-emerald-500/30"
          >
            Создать
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

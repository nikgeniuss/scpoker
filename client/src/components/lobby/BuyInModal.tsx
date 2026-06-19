import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, X } from 'lucide-react';
import { useBankroll } from '../../hooks/useBankroll';
import { formatMoney } from '../../config/chipFormat';
import type { RoomInfo } from '@poker-room/shared';

// Модалка выбора суммы бай-ина. Банкролл грузится через useBankroll (§9.3-E).
interface BuyInModalProps {
  room: RoomInfo;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}

export const BuyInModal = ({ room, onClose, onSubmit }: BuyInModalProps) => {
  const minBuyIn = room.bigBlind * room.buyInMinBb;
  const maxBuyIn = room.bigBlind * room.buyInMaxBb;
  const [amount, setAmount] = useState<number>(maxBuyIn);

  // Загружаем актуальный банкролл; по приходу выставляем дефолт суммы = max из доступного.
  const { bankroll, loadError } = useBankroll((chips) => setAmount(Math.min(maxBuyIn, chips)));

  const ceiling = bankroll === null ? maxBuyIn : Math.min(maxBuyIn, bankroll);
  const canSit = bankroll !== null && bankroll >= minBuyIn;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSit) return;
    const clamped = Math.max(minBuyIn, Math.min(ceiling, Math.floor(amount)));
    onSubmit(clamped);
  };

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
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Coins size={18} className="text-emerald-400" />
            Бай-ин: {room.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="text-sm text-gray-400 mb-3">
          Блайнды <span className="text-white">{formatMoney(room.smallBlind)}/{formatMoney(room.bigBlind)}</span> · диапазон <span className="text-white">{room.buyInMinBb}-{room.buyInMaxBb} BB</span> ({formatMoney(minBuyIn)}-{formatMoney(maxBuyIn)})
        </div>

        {bankroll === null && !loadError && (
          <div className="text-sm text-gray-400 py-6 text-center">Загрузка банкролла…</div>
        )}

        {loadError && (
          <div className="text-sm text-red-400 py-4 text-center">
            Не удалось загрузить банкролл. Попробуйте ещё раз.
          </div>
        )}

        {bankroll !== null && !canSit && (
          <div className="space-y-3">
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
              Недостаточно фишек для минимального бай-ина: нужно <b>{formatMoney(minBuyIn)}</b>, у вас <b>{formatMoney(bankroll)}</b>.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-gray-700 text-white font-bold"
            >
              Закрыть
            </button>
          </div>
        )}

        {bankroll !== null && canSit && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 flex justify-between">
                <span>Сумма бай-ина</span>
                <span className="text-gray-500">банкролл: <span className="text-white">{formatMoney(bankroll)}</span></span>
              </label>
              <div className="text-2xl font-bold text-emerald-400 mb-2">{formatMoney(amount)}</div>
              <input
                type="range"
                min={minBuyIn}
                max={ceiling}
                step={room.bigBlind}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                <span>{formatMoney(minBuyIn)}</span>
                <span>{formatMoney(ceiling)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAmount(minBuyIn)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-white/10 text-gray-300 hover:border-emerald-500/40"
              >
                Min ({formatMoney(minBuyIn)})
              </button>
              <button
                type="button"
                onClick={() => setAmount(ceiling)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-white/10 text-gray-300 hover:border-emerald-500/40"
              >
                Max ({formatMoney(ceiling)})
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 font-bold text-white shadow-lg shadow-emerald-500/30"
            >
              Сесть с {formatMoney(amount)}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useBadBeatStore } from '../store/badBeatStore';
import { formatMoney, parseMoney } from '../config/chipFormat';

// Экран «Пополнить» пул бэд-бита (админ) — admin-only (lazy за RequireAdmin, §0.12).
// Пополняет пул через badBeatStore → POST /api/admin/badbeat/topup (персист в badbeat.json).
const QUICK = [10000, 50000, 100000]; // центы: $100 / $500 / $1000

export const BadBeatTopUp = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const pool = useBadBeatStore((s) => s.pool);
  const topUp = useBadBeatStore((s) => s.topUp);
  const loadAdmin = useBadBeatStore((s) => s.loadAdmin);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

  const submit = async () => {
    const cents = parseMoney(amount);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error('Введите сумму больше 0');
      return;
    }
    await topUp(token, cents);
    toast.success('Пул пополнен на ' + formatMoney(cents));
    navigate('/club-admin/bad-beat');
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {/* Шапка */}
        <div className="relative flex items-center justify-center mb-6">
          <button
            onClick={() => navigate('/club-admin/bad-beat')}
            aria-label="Назад"
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">Пополнить</h1>
        </div>

        {/* Текущий пул */}
        <div className="rounded-2xl bg-gray-900 border border-white/10 p-4 mb-6 text-center">
          <div className="text-xs text-gray-500 mb-1">Текущий пул джекпота</div>
          <div className="text-3xl font-black tabular-nums">{formatMoney(pool)}</div>
        </div>

        {/* Сумма */}
        <label className="block text-sm text-gray-400 mb-2">Сумма пополнения</label>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-gray-500 text-lg">$</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-lg text-right outline-none focus:border-emerald-400"
          />
        </div>

        {/* Быстрые суммы */}
        <div className="grid grid-cols-3 gap-2 mb-7">
          {QUICK.map((c) => (
            <button
              key={c}
              onClick={() => setAmount((parseFloat(amount || '0') + c / 100).toString())}
              className="py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 hover:bg-white/10"
            >
              +{formatMoney(c)}
            </button>
          ))}
        </div>

        <button
          onClick={submit}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base transition-colors"
        >
          Пополнить
        </button>
        <p className="text-[10px] text-gray-600 mt-3 text-center">
          Пополнение сохраняется на сервере и сразу увеличивает пул джекпота.
        </p>
      </div>
    </div>
  );
};

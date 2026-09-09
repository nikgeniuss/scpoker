import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useBadBeatStore } from '../store/badBeatStore';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../config/chipFormat';

// Экран «История пополнения» (админ) — admin-only (lazy за RequireAdmin, §0.12).
// Читает историю пополнений через badBeatStore с /api/admin/badbeat (персист в badbeat.json).

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTs = (ts: number) => {
  const d = new Date(ts);
  return (
    pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
};

export const BadBeatTopUpHistory = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const topups = useBadBeatStore((s) => s.topups);
  const loadAdmin = useBadBeatStore((s) => s.loadAdmin);

  useEffect(() => {
    loadAdmin(token);
  }, [loadAdmin, token]);

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
          <h1 className="text-xl font-bold">История пополнения</h1>
        </div>

        {topups.length === 0 ? (
          <div className="text-center text-gray-600 py-20">Пополнений пока нет.</div>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-gray-800 text-xs font-bold text-gray-400">
              <span>Дата</span>
              <span className="text-right w-24">Сумма</span>
              <span className="text-right w-20">Админ</span>
            </div>
            {topups.map((t, i) => (
              <div
                key={t.ts + '-' + i}
                className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-t border-white/5 items-center"
              >
                <span className="text-gray-300 text-sm tabular-nums">{fmtTs(t.ts)}</span>
                <span className="text-right w-24 text-emerald-400 text-sm font-semibold tabular-nums">
                  +{formatMoney(t.amount)}
                </span>
                <span className="text-right w-20 text-gray-300 text-sm truncate" title={t.by}>
                  {t.by}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600 mt-3">
          История пополнений хранится на сервере.
        </p>
      </div>
    </div>
  );
};

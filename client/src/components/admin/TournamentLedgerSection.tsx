import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { formatMoney } from '../../config/chipFormat';
import type { TournamentLedgerEntry, TournamentLedgerTotals } from '../../pages/admin/types';

// Журнал турнирной экономики. Смысл: оверлей (доплата до гарантии) — это ЭМИССИЯ фишек, она
// нигде не списывается, и до появления журнала её след исчезал вместе с убранным из лобби
// турниром. Здесь видно, сколько турниры принесли рейком и сколько стоили оверлеем.
const pad = (n: number) => String(n).padStart(2, '0');
const fmtTs = (ts: number) => {
  const d = new Date(ts);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const netClass = (v: number) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-gray-300');
const withSign = (v: number) => (v > 0 ? '+' : '') + formatMoney(v);

export const TournamentLedgerSection = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [log, setLog] = useState<TournamentLedgerEntry[] | null>(null);
  const [totals, setTotals] = useState<TournamentLedgerTotals | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ log: TournamentLedgerEntry[]; totals: TournamentLedgerTotals }>('/admin/tournament-ledger')
      .then((r) => {
        if (!alive) return;
        setLog(r.log);
        setTotals(r.totals);
      })
      .catch(() => alive && setLog([]));
    return () => { alive = false; };
  }, [api]);

  if (log === null) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2">Экономика турниров</h3>

      {log.length === 0 ? (
        <div className="text-gray-500 text-sm py-4">Завершённых турниров пока нет.</div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="rounded-xl bg-gray-800/60 border border-white/10 p-3">
                <div className="text-[11px] text-gray-400">Турниров</div>
                <div className="text-white font-bold tabular-nums">{totals.tournaments}</div>
              </div>
              <div className="rounded-xl bg-gray-800/60 border border-white/10 p-3">
                <div className="text-[11px] text-gray-400">Рейк</div>
                <div className="text-emerald-400 font-bold tabular-nums">{formatMoney(totals.rake)}</div>
              </div>
              <div className="rounded-xl bg-gray-800/60 border border-white/10 p-3">
                <div className="text-[11px] text-gray-400">Оверлей (эмиссия)</div>
                <div className="text-rose-400 font-bold tabular-nums">{formatMoney(totals.overlay)}</div>
              </div>
              <div className="rounded-xl bg-gray-800/60 border border-white/10 p-3">
                <div className="text-[11px] text-gray-400">Итого руму</div>
                <div className={'font-bold tabular-nums ' + netClass(totals.net)}>{withSign(totals.net)}</div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/60 text-gray-400 text-[11px] uppercase">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Турнир</th>
                  <th className="text-right font-semibold px-3 py-2">Входы</th>
                  <th className="text-right font-semibold px-3 py-2">Собрано</th>
                  <th className="text-right font-semibold px-3 py-2">Рейк</th>
                  <th className="text-right font-semibold px-3 py-2">Оверлей</th>
                  <th className="text-right font-semibold px-3 py-2">Выплачено</th>
                  <th className="text-right font-semibold px-3 py-2">Итого</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.tournamentId} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white font-medium truncate max-w-[160px]" title={e.tournamentId}>{e.name}</div>
                      <div className="text-[11px] text-gray-500">{e.type.toUpperCase()} · {fmtTs(e.finishedAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 tabular-nums">
                      {e.entries}
                      {e.uniquePlayers !== e.entries && <span className="text-gray-500"> / {e.uniquePlayers}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatMoney(e.collectedFees)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">{e.rake ? formatMoney(e.rake) : '—'}</td>
                    <td className="px-3 py-2 text-right text-rose-400 tabular-nums">{e.overlay ? formatMoney(e.overlay) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatMoney(e.paidOut)}</td>
                    <td className={'px-3 py-2 text-right font-bold tabular-nums ' + netClass(e.net)}>{withSign(e.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

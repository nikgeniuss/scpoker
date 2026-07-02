import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useResponsibleGamblingStore } from '../store/responsibleGamblingStore';
import { formatMoney, parseMoney } from '../config/chipFormat';

type Period = 'day' | 'week' | 'month';

function isActiveUntil(until: string | undefined): boolean {
  if (!until) return false;
  if (until === 'permanent') return true;
  return new Date(until) > new Date();
}

function formatUntil(until: string, lang: string): string {
  if (until === 'permanent') return '∞';
  return new Date(until).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU');
}

// Личный кабинет Responsible Gambling (/responsible-gambling, ROADMAP §11.2). Каждая секция
// видна только если соответствующий admin-тоггл включён (config из /api/responsible-gambling/me) —
// сервер тоже проверяет тоггл на PUT/POST, тут только скрытие UI.
export const ResponsibleGambling = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { config, state, lossThisPeriod, depositThisPeriod, loaded, loadMe, saveLimits, selfExclude, timeout } =
    useResponsibleGamblingStore();

  useEffect(() => {
    loadMe(token);
  }, [loadMe, token]);

  const [depositLimit, setDepositLimit] = useState('');
  const [depositPeriod, setDepositPeriod] = useState<Period>('day');
  const [lossLimit, setLossLimit] = useState('');
  const [lossPeriod, setLossPeriod] = useState<Period>('day');
  const [sessionLimit, setSessionLimit] = useState('');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    setDepositLimit(state.depositLimitCents ? formatMoney(state.depositLimitCents) : '');
    setDepositPeriod(state.depositLimitPeriod ?? 'day');
    setLossLimit(state.lossLimitCents ? formatMoney(state.lossLimitCents) : '');
    setLossPeriod(state.lossLimitPeriod ?? 'day');
    setSessionLimit(state.sessionTimeLimitMinutes ? String(state.sessionTimeLimitMinutes) : '');
  }, [loaded, state]);

  if (!config) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex items-center justify-center text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  const selfExcludedActive = isActiveUntil(state.selfExcludedUntil);
  const timeoutActive = isActiveUntil(state.timeoutUntil);
  const blocked = selfExcludedActive || timeoutActive;

  const periodSelect = (value: Period, onChange: (p: Period) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      disabled={blocked}
      className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40"
    >
      <option value="day">{t('responsibleGambling.periodDay')}</option>
      <option value="week">{t('responsibleGambling.periodWeek')}</option>
      <option value="month">{t('responsibleGambling.periodMonth')}</option>
    </select>
  );

  const saveOne = async (patch: Record<string, unknown>) => {
    const res = await saveLimits(token, patch);
    if (res.ok) toast.success(t('responsibleGambling.saved'));
    else toast.error(res.error || t('responsibleGambling.saveError'));
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/profile')}
            aria-label={t('common.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('responsibleGambling.title')}</h1>
        </div>

        {blocked && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6 flex gap-3">
            <ShieldAlert className="text-amber-400 shrink-0" size={22} />
            <div className="text-sm text-amber-200">
              {selfExcludedActive
                ? t('responsibleGambling.selfExcludedActiveUntil', { until: formatUntil(state.selfExcludedUntil!, i18n.language) })
                : t('responsibleGambling.timeoutActiveUntil', { until: formatUntil(state.timeoutUntil!, i18n.language) })}
            </div>
          </div>
        )}

        {/* Лимит на депозит */}
        {config.depositLimitEnabled && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
            <h2 className="font-bold mb-1">{t('responsibleGambling.depositLimitTitle')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('responsibleGambling.depositLimitHint')}</p>
            {depositThisPeriod !== null && state.depositLimitCents ? (
              <div className="mb-3">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-1">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-amber-500"
                    style={{ width: Math.min(100, (depositThisPeriod / state.depositLimitCents) * 100) + '%' }}
                  />
                </div>
                <div className="text-xs text-gray-400">{formatMoney(depositThisPeriod)} / {formatMoney(state.depositLimitCents)}</div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                value={depositLimit}
                onChange={(e) => setDepositLimit(e.target.value)}
                disabled={blocked}
                placeholder="0"
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white outline-none disabled:opacity-40"
              />
              {periodSelect(depositPeriod, setDepositPeriod)}
              <button
                disabled={blocked}
                onClick={() => saveOne({ depositLimitCents: depositLimit ? parseMoney(depositLimit) : null, depositLimitPeriod: depositPeriod })}
                className="px-4 py-2 rounded-lg bg-emerald-600 font-bold text-sm disabled:opacity-40"
              >
                {t('responsibleGambling.save')}
              </button>
            </div>
          </section>
        )}

        {/* Лимит на потери */}
        {config.lossLimitEnabled && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
            <h2 className="font-bold mb-1">{t('responsibleGambling.lossLimitTitle')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('responsibleGambling.lossLimitHint')}</p>
            {lossThisPeriod !== null && state.lossLimitCents ? (
              <div className="mb-3">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-1">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-red-500"
                    style={{ width: Math.min(100, (lossThisPeriod / state.lossLimitCents) * 100) + '%' }}
                  />
                </div>
                <div className="text-xs text-gray-400">{formatMoney(lossThisPeriod)} / {formatMoney(state.lossLimitCents)}</div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                value={lossLimit}
                onChange={(e) => setLossLimit(e.target.value)}
                disabled={blocked}
                placeholder="0"
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white outline-none disabled:opacity-40"
              />
              {periodSelect(lossPeriod, setLossPeriod)}
              <button
                disabled={blocked}
                onClick={() => saveOne({ lossLimitCents: lossLimit ? parseMoney(lossLimit) : null, lossLimitPeriod: lossPeriod })}
                className="px-4 py-2 rounded-lg bg-emerald-600 font-bold text-sm disabled:opacity-40"
              >
                {t('responsibleGambling.save')}
              </button>
            </div>
          </section>
        )}

        {/* Лимит времени сессии */}
        {config.sessionTimeLimitEnabled && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
            <h2 className="font-bold mb-1">{t('responsibleGambling.sessionLimitTitle')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('responsibleGambling.sessionLimitHint')}</p>
            <div className="flex gap-2">
              <input
                value={sessionLimit}
                onChange={(e) => setSessionLimit(e.target.value)}
                disabled={blocked}
                placeholder="0"
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white outline-none disabled:opacity-40"
              />
              <span className="self-center text-sm text-gray-400">{t('responsibleGambling.minutes')}</span>
              <button
                disabled={blocked}
                onClick={() => saveOne({ sessionTimeLimitMinutes: sessionLimit ? Math.round(Number(sessionLimit)) : null })}
                className="px-4 py-2 rounded-lg bg-emerald-600 font-bold text-sm disabled:opacity-40"
              >
                {t('responsibleGambling.save')}
              </button>
            </div>
          </section>
        )}

        {/* Тайм-аут */}
        {config.timeoutEnabled && !selfExcludedActive && !timeoutActive && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
            <h2 className="font-bold mb-1">{t('responsibleGambling.timeoutTitle')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('responsibleGambling.timeoutHint')}</p>
            {confirmAction?.startsWith('timeout:') ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-300">{t('responsibleGambling.confirm')}</span>
                <button
                  onClick={async () => {
                    const d = confirmAction.split(':')[1] as '24h' | '7d' | '30d';
                    const res = await timeout(token, d);
                    if (!res.ok) toast.error(res.error || t('responsibleGambling.saveError'));
                    setConfirmAction(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 font-bold"
                >
                  {t('responsibleGambling.confirmYes')}
                </button>
                <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 rounded-lg bg-white/10">
                  {t('responsibleGambling.confirmNo')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {(['24h', '7d', '30d'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setConfirmAction(`timeout:${d}`)}
                    className="px-4 py-2 rounded-lg bg-white/10 font-bold text-sm hover:bg-white/20"
                  >
                    {t(`responsibleGambling.duration.${d}`)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Самоисключение */}
        {config.selfExclusionEnabled && !selfExcludedActive && !timeoutActive && (
          <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 mb-4">
            <h2 className="font-bold mb-1 text-red-300">{t('responsibleGambling.selfExclusionTitle')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('responsibleGambling.selfExclusionHint')}</p>
            {confirmAction?.startsWith('exclude:') ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-300">{t('responsibleGambling.confirm')}</span>
                <button
                  onClick={async () => {
                    const d = confirmAction.split(':')[1] as '6m' | '1y' | 'permanent';
                    const res = await selfExclude(token, d);
                    if (!res.ok) toast.error(res.error || t('responsibleGambling.saveError'));
                    setConfirmAction(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 font-bold"
                >
                  {t('responsibleGambling.confirmYes')}
                </button>
                <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 rounded-lg bg-white/10">
                  {t('responsibleGambling.confirmNo')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {(['6m', '1y', 'permanent'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setConfirmAction(`exclude:${d}`)}
                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 font-bold text-sm hover:bg-red-500/30"
                  >
                    {t(`responsibleGambling.duration.${d}`)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default ResponsibleGambling;

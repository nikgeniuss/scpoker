import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, Gift, Copy, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useReferralStore } from '../store/referralStore';

// Экран «Пригласить друзей» (ROADMAP §10.21.5) — свой код + share-ссылка (?ref=code на /register).
// Награда — HUB-коины, разовая по вехе (приглашённый наиграл N раздач), начисляется автоматически
// сервером — на этом экране нет кнопки «клейм», только статус (ожидают/начислено).
export const Referral = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { enabled, code, invitedCount, rewardedCount, pendingCount, handsThreshold, referrerReward, refereeReward, referrerRakePercent, pendingRake, totalRakeReward, loadMine } =
    useReferralStore();

  useEffect(() => {
    loadMine(token);
  }, [loadMine, token]);

  const shareLink = code ? `${window.location.origin}/register?ref=${code}` : '';

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success(t('referral.copied'));
    } catch {
      toast.error(t('referral.copyError'));
    }
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/profile')}
            aria-label={t('referral.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('referral.title')}</h1>
        </div>

        {!enabled ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            {t('referral.disabled')}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 p-5 mb-6 flex flex-col items-center gap-3 text-center">
              <Gift size={28} className="text-amber-400" />
              <div className="text-sm text-white/60">
                {t('referral.rewardExplain', { referrerReward, refereeReward, handsThreshold })}
              </div>
              <div className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold tracking-widest text-emerald-400 truncate">{code}</span>
                <button
                  onClick={copyLink}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25"
                >
                  <Copy size={13} /> {t('referral.copyLink')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 text-center">
                <Users size={16} className="mx-auto mb-1 text-white/40" />
                <div className="text-lg font-black tabular-nums">{invitedCount ?? 0}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{t('referral.invited')}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 text-center">
                <div className="text-lg font-black tabular-nums text-amber-400">{pendingCount ?? 0}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{t('referral.pending')}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 text-center">
                <div className="text-lg font-black tabular-nums text-emerald-400">{rewardedCount ?? 0}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{t('referral.rewarded')}</div>
              </div>
            </div>

            {!!referrerRakePercent && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 mb-3">
                <div className="text-xs font-bold text-emerald-300 mb-1">
                  {t('referral.rakeShareTitle', { percent: referrerRakePercent })}
                </div>
                <p className="text-[10.5px] text-white/50 leading-relaxed mb-2">
                  {t('referral.rakeShareExplain', { percent: referrerRakePercent, count: handsThreshold ?? 0 })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-black/30 px-3 py-2">
                    <div className="text-sm font-black tabular-nums text-amber-400">{pendingRake ?? 0} HUB</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{t('referral.rakePending')}</div>
                  </div>
                  <div className="rounded-xl bg-black/30 px-3 py-2">
                    <div className="text-sm font-black tabular-nums text-emerald-400">{totalRakeReward ?? 0} HUB</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{t('referral.rakeEarned')}</div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[10.5px] text-white/30 leading-relaxed">{t('referral.footnote')}</p>
          </>
        )}
      </div>
    </div>
  );
};

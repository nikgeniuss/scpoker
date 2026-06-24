import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import { formatMoney } from '../config/chipFormat';
import type { PaymentChain, WithdrawalRequest } from '@poker-room/shared';

const CHAIN_LABEL: Record<PaymentChain, string> = {
  tron: 'Tron (TRC-20)',
  ethereum: 'Ethereum (ERC-20)',
  bsc: 'BSC (BEP-20)',
};

const CHAINS: PaymentChain[] = ['tron', 'ethereum', 'bsc'];

// Tron и BSC отложены до отдельного testnet-прогона (см. ROADMAP §11.1: для BSC faucet'ы требуют
// mainnet-баланс, для Tron — нет доступного web-faucet'а на тестовый USDT без скам-ботов в Telegram) —
// сети скрыты от выбора, чтобы игрок не пытался пополнить то, что ещё не проверено на реальной сети.
// Ethereum полностью проверен реальным циклом депозит→свип на Sepolia (2026-06-19).
const CHAIN_READY: Record<PaymentChain, boolean> = { tron: false, ethereum: true, bsc: false };

function usdtRawToDisplay(raw: string): string {
  return (Number(BigInt(raw)) / 1e6).toFixed(2);
}

const WITHDRAWAL_STATUS_KEY: Record<WithdrawalRequest['status'], string> = {
  pending: 'wallet.statusPending',
  approved: 'wallet.statusApproved',
  sending: 'wallet.statusSending',
  paid: 'wallet.statusPaid',
  rejected: 'wallet.statusRejected',
  failed: 'wallet.statusFailed',
};

export function Wallet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { wallet, deposits, withdrawals, fetchWallet, fetchHistory, requestWithdrawal } = useWalletStore();
  const [chain, setChain] = useState<PaymentChain>('ethereum');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [payoutAddress, setPayoutAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchWallet(token);
    fetchHistory(token);
  }, [token, fetchWallet, fetchHistory]);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const submitWithdraw = async () => {
    if (!token) return;
    const amountUsdt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || !payoutAddress.trim()) return;
    setSubmitting(true);
    try {
      const result = await requestWithdrawal(token, chain, amountUsdt, payoutAddress.trim());
      if (result.ok) {
        toast.success(t('wallet.withdrawSuccess'));
        setAmount('');
        setPayoutAddress('');
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const chainInfo = wallet?.chains[chain];
  const history = [
    ...deposits.map((d) => ({ key: `d-${d.chain}-${d.txid}`, at: d.creditedAt, node: (
      <span className="text-sm text-emerald-400">{t('wallet.depositRecord', { amount: usdtRawToDisplay(d.amountUsdtRaw) })}</span>
    ) })),
    ...withdrawals.map((w) => ({ key: `w-${w.id}`, at: w.createdAt, node: (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white/80">{t('wallet.withdrawalRecord', { amount: formatMoney(w.amountChips) })}</span>
        <span className="text-xs text-white/40">{t(WITHDRAWAL_STATUS_KEY[w.status])}</span>
      </div>
    ) })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('wallet.title')}</span>
      </div>

      <div className="flex-1 px-4 pb-24 space-y-6">
        {wallet && !wallet.enabled && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-3">
            {t('wallet.disabled')}
          </div>
        )}

        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/5">
          {CHAINS.map((c) => (
            <button
              key={c}
              onClick={() => CHAIN_READY[c] && setChain(c)}
              disabled={!CHAIN_READY[c]}
              title={!CHAIN_READY[c] ? t('lobby.soon') : ''}
              className={
                'py-2 rounded-xl text-xs font-bold transition-all ' +
                (chain === c
                  ? 'bg-emerald-500 text-white'
                  : CHAIN_READY[c]
                  ? 'text-white/50 hover:text-white'
                  : 'text-white/20 cursor-not-allowed')
              }
            >
              {CHAIN_LABEL[c]}
              {!CHAIN_READY[c] && <span className="ml-1 text-[9px] opacity-60">{t('lobby.soon')}</span>}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div className="text-sm font-bold text-white/70">{t('wallet.yourAddress')}</div>
          {chainInfo?.address ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs font-mono break-all text-white/90">{chainInfo.address}</span>
              <button
                onClick={() => copyAddress(chainInfo.address!)}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 text-white/70"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
          ) : (
            <div className="text-sm text-white/30">—</div>
          )}
          <p className="text-xs text-white/30">{t('wallet.depositHint')}</p>
        </div>

        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div className="text-sm font-bold text-white/70">{t('wallet.withdraw')}</div>
          {wallet && (
            <p className="text-xs text-white/30">
              {t('wallet.limits', { min: wallet.minWithdrawalUsdt, max: wallet.maxWithdrawalUsdt })}
            </p>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('wallet.amount')}
            className="w-full bg-white/10 rounded-lg px-3 py-2.5 text-sm outline-none border border-white/15 focus:border-emerald-500/50"
          />
          <input
            type="text"
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
            placeholder={t('wallet.payoutAddressPlaceholder')}
            className="w-full bg-white/10 rounded-lg px-3 py-2.5 text-sm outline-none border border-white/15 focus:border-emerald-500/50"
          />
          <button
            onClick={submitWithdraw}
            disabled={submitting || !wallet?.enabled}
            className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-bold text-sm transition-colors"
          >
            {submitting ? t('wallet.submitting') : t('wallet.submitWithdraw')}
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-bold text-white/70 px-1">{t('wallet.history')}</div>
          {history.length === 0 ? (
            <div className="text-sm text-white/30 px-1">{t('wallet.noHistory')}</div>
          ) : (
            <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
              {history.map((h) => (
                <div key={h.key} className="px-4 py-3">{h.node}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

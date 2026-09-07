import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Copy, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../config/apiErrors';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import { useTelegram } from '../hooks/useTelegram';
import { toCsv, csvFileName, showDeposits, showWithdrawals, PAYMENT_FILTERS, type PaymentFilter } from '../config/paymentHistory';
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

// Цвет статуса — иначе отклонённый/неудачный вывод неотличим от выплаченного (critique 2026-08-12).
const WITHDRAWAL_STATUS_COLOR: Record<WithdrawalRequest['status'], string> = {
  pending: 'text-amber-300',
  approved: 'text-amber-300',
  sending: 'text-amber-300',
  paid: 'text-emerald-400',
  rejected: 'text-red-400',
  failed: 'text-red-400',
};

// EVM-адрес (Ethereum/BSC) — 0x + 40 hex. Tron использует другой формат base58,
// сейчас не в CHAIN_READY, детальную валидацию добавим вместе с включением сети.
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
function isValidPayoutAddress(chain: PaymentChain, address: string): boolean {
  if (chain === 'ethereum' || chain === 'bsc') return EVM_ADDRESS_RE.test(address);
  return address.length > 0;
}

export function Wallet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { wallet, deposits, withdrawals, loading, fetchWallet, fetchHistory, requestWithdrawal } = useWalletStore();
  const { isTelegram } = useTelegram();
  // Фильтр и выгрузка истории (ROADMAP §11.1).
  const [historyFilter, setHistoryFilter] = useState<PaymentFilter>('all');

  const [chain, setChain] = useState<PaymentChain>('ethereum');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [payoutAddress, setPayoutAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addressError, setAddressError] = useState(false);

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

  // Шаг 1 — не отправляет ничего, только проверяет ввод и переводит форму в режим подтверждения.
  // Вывод необратим (реальные USDT на blockchain-адрес), поэтому перед фактической отправкой
  // игрок обязан ещё раз увидеть сумму/сеть/адрес и подтвердить осознанно (critique 2026-08-12, P0).
  const startConfirm = () => {
    const amountUsdt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || !payoutAddress.trim()) return;
    if (!isValidPayoutAddress(chain, payoutAddress.trim())) {
      setAddressError(true);
      return;
    }
    setAddressError(false);
    setConfirming(true);
  };

  // Шаг 2 — фактическая отправка, только из режима подтверждения.
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
        setConfirming(false);
      } else {
        toast.error(apiErrorMessage(result.error, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const chainInfo = wallet?.chains[chain];
  const history = [
    ...(showDeposits(historyFilter) ? deposits : []).map((d) => ({ key: `d-${d.chain}-${d.txid}`, at: d.creditedAt, node: (
      <span className="text-sm text-emerald-400">{t('wallet.depositRecord', { amount: usdtRawToDisplay(d.amountUsdtRaw) })}</span>
    ) })),
    ...(showWithdrawals(historyFilter) ? withdrawals : []).map((w) => ({ key: `w-${w.id}`, at: w.createdAt, node: (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white/80">{t('wallet.withdrawalRecord', { amount: formatMoney(w.amountChips) })}</span>
        <span className={'text-xs font-bold ' + WITHDRAWAL_STATUS_COLOR[w.status]}>{t(WITHDRAWAL_STATUS_KEY[w.status])}</span>
      </div>
    ) })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Выгрузка CSV. В Telegram Mini App скачивание файла заблокировано, поэтому там копируем
  // в буфер — иначе кнопка молча ничего не делала бы (§5: работать должно на всех трёх таргетах).
  const exportCsv = async () => {
    const csv = toCsv(deposits, withdrawals, historyFilter);
    if (isTelegram) {
      try {
        await navigator.clipboard.writeText(csv);
        toast.success(t('wallet.exportCopied'));
      } catch {
        toast.error(t('wallet.exportFailed'));
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-[100dvh] bg-void-black text-white flex flex-col">
    <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="w-11 h-11 -ml-2 flex items-center justify-center text-white/40 hover:text-white/80">
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
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 text-white/70"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
          ) : loading ? (
            <div className="h-4 w-48 max-w-full rounded bg-white/10 animate-pulse" aria-label={t('wallet.loadingAddress')} />
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

          {confirming ? (
            // Шаг подтверждения — вывод необратим, поэтому перед реальной отправкой
            // ещё раз показываем сумму/сеть/адрес целиком, а не только disabled-состояние кнопки.
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200">
                  <div className="font-bold mb-1">{t('wallet.confirmHeading')}</div>
                  <div>{t('wallet.confirmBody', { amount, chain: CHAIN_LABEL[chain] })}</div>
                  <div className="mt-1 font-mono break-all text-amber-100/90">{payoutAddress.trim()}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-white/80 font-bold text-sm transition-colors"
                >
                  {t('wallet.editButton')}
                </button>
                <button
                  onClick={submitWithdraw}
                  disabled={submitting || !wallet?.enabled}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-40 disabled:hover:shadow-none text-white font-bold text-sm transition-all"
                >
                  {submitting ? t('wallet.submitting') : t('wallet.confirmButton')}
                </button>
              </div>
            </div>
          ) : (
            <>
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
                onChange={(e) => { setPayoutAddress(e.target.value); setAddressError(false); }}
                placeholder={t('wallet.payoutAddressPlaceholder')}
                className={
                  'w-full bg-white/10 rounded-lg px-3 py-2.5 text-sm outline-none border focus:border-emerald-500/50 ' +
                  (addressError ? 'border-red-500/60' : 'border-white/15')
                }
              />
              {addressError && <p className="text-xs text-red-400">{t('wallet.addressInvalid')}</p>}
              <button
                onClick={startConfirm}
                disabled={submitting || !wallet?.enabled}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-40 disabled:hover:shadow-none text-white font-bold text-sm transition-all"
              >
                {t('wallet.submitWithdraw')}
              </button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm font-bold text-white/70">{t('wallet.history')}</span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={deposits.length === 0 && withdrawals.length === 0}
              className="text-xs font-bold text-white/50 hover:text-white/80 disabled:opacity-30 min-h-[44px] px-2"
            >
              {t('wallet.export')}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/5">
            {PAYMENT_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setHistoryFilter(f)}
                className={
                  'min-h-[44px] rounded-xl text-xs font-bold transition-colors ' +
                  (historyFilter === f ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70')
                }
              >
                {t('wallet.filter_' + f)}
              </button>
            ))}
          </div>
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
    </div>
  );
}

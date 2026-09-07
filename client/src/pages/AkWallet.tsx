import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, AlertTriangle, ArrowDown, ArrowUp, ArrowLeftRight, X, Inbox, CircleQuestionMark } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../config/apiErrors';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import { useTelegram } from '../hooks/useTelegram';
import { toCsv, csvFileName, showDeposits, showWithdrawals, PAYMENT_FILTERS, type PaymentFilter } from '../config/paymentHistory';
import { formatMoney } from '../config/chipFormat';
import type { PaymentChain, WithdrawalRequest } from '@poker-room/shared';

// AK-скин кошелька ("/wallet" при appTheme='ak') — переиспользует useWalletStore/useAuthStore
// и ровно ту же бизнес-логику депозита/вывода, что классический Wallet.tsx (см. его же), только
// в вёрстке по референсу AK Poker. Мелкие конфиги ниже (CHAIN_LABEL и т.д.) — локальные и в
// Wallet.tsx (не вынесены в общий модуль), поэтому дублируются так же локально и здесь.
const CHAIN_LABEL: Record<PaymentChain, string> = {
  tron: 'Tron (TRC-20)',
  ethereum: 'Ethereum (ERC-20)',
  bsc: 'BSC (BEP-20)',
};

const CHAINS: PaymentChain[] = ['tron', 'ethereum', 'bsc'];

// Tron и BSC отложены до отдельного testnet-прогона (см. Wallet.tsx) — сети скрыты от выбора.
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

// Цвет статуса в токенах AK-палитры (аналог amber/emerald/red в Wallet.tsx).
const WITHDRAWAL_STATUS_COLOR: Record<WithdrawalRequest['status'], string> = {
  pending: 'text-ak-gold',
  approved: 'text-ak-gold',
  sending: 'text-ak-gold',
  paid: 'text-ak-green',
  rejected: 'text-ak-red',
  failed: 'text-ak-red',
};

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
function isValidPayoutAddress(chain: PaymentChain, address: string): boolean {
  if (chain === 'ethereum' || chain === 'bsc') return EVM_ADDRESS_RE.test(address);
  return address.length > 0;
}

type ModalKind = 'deposit' | 'withdraw' | null;

export const AkWallet = () => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { wallet, deposits, withdrawals, loading, fetchWallet, fetchHistory, requestWithdrawal } = useWalletStore();
  const { isTelegram } = useTelegram();
  // Фильтр и выгрузка истории (ROADMAP §11.1).
  const [historyFilter, setHistoryFilter] = useState<PaymentFilter>('all');


  const [modal, setModal] = useState<ModalKind>(null);
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

  // Шаг 1 подтверждения вывода — см. Wallet.tsx: вывод необратим, поэтому сначала проверяем
  // ввод и переводим форму в режим подтверждения, а не отправляем запрос сразу.
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
        setModal(null);
      } else {
        toast.error(apiErrorMessage(result.error, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setConfirming(false);
    setAddressError(false);
  };

  const chainInfo = wallet?.chains[chain];
  const history = [
    ...(showDeposits(historyFilter) ? deposits : []).map((d) => ({ key: `d-${d.chain}-${d.txid}`, at: d.creditedAt, node: (
      <span className="text-sm font-bold text-ak-green">{t('wallet.depositRecord', { amount: usdtRawToDisplay(d.amountUsdtRaw) })}</span>
    ) })),
    ...(showWithdrawals(historyFilter) ? withdrawals : []).map((w) => ({ key: `w-${w.id}`, at: w.createdAt, node: (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ak-text">{t('wallet.withdrawalRecord', { amount: formatMoney(w.amountChips) })}</span>
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
    <div className="ak-font min-h-[100dvh] bg-ak-bg flex flex-col">
      {/* Локальная шапка раздела (часть контента страницы, не глобальный chrome) */}
      <div className="bg-ak-navy px-4 py-3.5 shrink-0">
        <h1 className="text-white font-bold text-lg">{t('wallet.title')}</h1>
      </div>

      <div className="w-full max-w-md mx-auto flex-1 px-4 pt-3 pb-6 space-y-3">
        {wallet && !wallet.enabled && (
          <div className="rounded-[13px] bg-ak-gold/10 border border-ak-gold/40 text-ak-text text-sm px-4 py-3">
            {t('wallet.disabled')}
          </div>
        )}

        {/* Баланс: фишки платформы + денежные фишки казино */}
        <div className="bg-ak-card rounded-[13px] shadow-sm px-4 py-3 divide-y divide-ak-bg">
          <div className="pb-3">
            <div className="flex items-center gap-1 text-ak-text-muted text-xs mb-2">
              <span>Фишки платформы</span>
              <span title="Игровой банкролл на платформе"><CircleQuestionMark size={14} /></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 shrink-0 rounded-full bg-ak-green flex items-center justify-center text-white text-sm font-bold">$</span>
              <span className="text-lg font-bold text-ak-text">{formatMoney(user?.chips ?? 0)}</span>
            </div>
          </div>
          <div className="pt-3">
            <div className="flex items-center gap-1 text-ak-text-muted text-xs mb-2">
              <span>Денежные фишки казино</span>
              <span title="Раздел в разработке"><CircleQuestionMark size={14} /></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 shrink-0 rounded-full bg-ak-green flex items-center justify-center text-white text-sm font-bold">$</span>
              <span className="text-lg font-bold text-ak-text">{formatMoney(0)}</span>
            </div>
          </div>
        </div>

        {/* Пополнение / Обмен / Вывод */}
        <div className="grid grid-cols-3 justify-items-center gap-2">
          <button
            onClick={() => setModal('deposit')}
            className="w-24 h-24 flex flex-col items-center justify-center gap-1.5 rounded-full bg-ak-teal text-white active:opacity-90"
          >
            <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-ak-teal">
              <ArrowDown size={18} />
            </span>
            <span className="text-xs font-bold">Пополнение</span>
          </button>
          {/* Обмен фишек платформы↔казино — в бэкенде проекта нет отдельного эндпоинта для этого
              (server/src/payments/exchange.ts конвертирует только USDT↔фишки для депозита/вывода).
              Визуальный элемент референса без готовой функции — кнопка кликабельна, но сообщает,
              что раздел в разработке, вместо тихого disabled без обратной связи на touch-устройствах. */}
          <button
            onClick={() => toast('Обмен фишек скоро появится')}
            className="w-24 h-24 flex flex-col items-center justify-center gap-1.5 rounded-full bg-ak-gold text-ak-navy active:opacity-90"
          >
            <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-ak-gold">
              <ArrowLeftRight size={18} />
            </span>
            <span className="text-xs font-bold">Обмен</span>
          </button>
          <button
            onClick={() => setModal('withdraw')}
            className="w-24 h-24 flex flex-col items-center justify-center gap-1.5 rounded-full bg-ak-navy text-white active:opacity-90"
          >
            <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-ak-navy">
              <ArrowUp size={18} />
            </span>
            <span className="text-xs font-bold">{t('wallet.withdraw')}</span>
          </button>
        </div>

        {/* Запись — история депозитов/выводов */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm font-bold text-ak-text-muted">Запись</span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={deposits.length === 0 && withdrawals.length === 0}
              className="text-xs font-bold text-ak-navy disabled:opacity-30 min-h-[44px] px-2"
            >
              {t('wallet.export')}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-[13px] bg-ak-bg">
            {PAYMENT_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setHistoryFilter(f)}
                className={
                  'min-h-[44px] rounded-[9px] text-xs font-bold transition-colors ' +
                  (historyFilter === f ? 'bg-ak-card text-ak-text shadow-sm' : 'text-ak-text-muted')
                }
              >
                {t('wallet.filter_' + f)}
              </button>
            ))}
          </div>
          {history.length === 0 ? (
            <div className="bg-ak-card rounded-[13px] py-8 flex flex-col items-center justify-center gap-2">
              <Inbox size={44} className="text-ak-text-muted/40" />
              <span className="text-sm text-ak-text-muted">Нет данных</span>
            </div>
          ) : (
            <div className="bg-ak-card rounded-[13px] divide-y divide-ak-bg overflow-hidden">
              {history.map((h) => (
                <div key={h.key} className="px-4 py-3">{h.node}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модалка пополнения — тот же адрес по сети, что в Wallet.tsx */}
      {modal === 'deposit' && (
        <div className="fixed inset-0 z-50 bg-ak-navy/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="ak-font bg-ak-card rounded-[13px] w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-ak-text font-bold text-base">Пополнение</h2>
              <button onClick={closeModal} className="w-11 h-11 -m-2 flex items-center justify-center text-ak-text-muted">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-ak-bg">
              {CHAINS.map((c) => (
                <button
                  key={c}
                  onClick={() => CHAIN_READY[c] && setChain(c)}
                  disabled={!CHAIN_READY[c]}
                  title={!CHAIN_READY[c] ? t('lobby.soon') : ''}
                  className={
                    'py-2 rounded-full text-[11px] font-bold transition-colors ' +
                    (chain === c
                      ? 'bg-ak-teal text-white'
                      : CHAIN_READY[c]
                      ? 'text-ak-text-muted'
                      : 'text-ak-text-muted/40 cursor-not-allowed')
                  }
                >
                  {CHAIN_LABEL[c]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-ak-text-muted">{t('wallet.yourAddress')}</div>
              {chainInfo?.address ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-xs font-mono break-all text-ak-text">{chainInfo.address}</span>
                  <button
                    onClick={() => copyAddress(chainInfo.address!)}
                    className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-ak-bg text-ak-text-muted"
                  >
                    {copied ? <Check size={16} className="text-ak-green" /> : <Copy size={16} />}
                  </button>
                </div>
              ) : loading ? (
                <div className="h-4 w-48 max-w-full rounded bg-ak-bg animate-pulse" aria-label={t('wallet.loadingAddress')} />
              ) : (
                <div className="text-sm text-ak-text-muted">—</div>
              )}
              <p className="text-xs text-ak-text-muted">{t('wallet.depositHint')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Модалка вывода — двухшаговое подтверждение из Wallet.tsx (вывод необратим) */}
      {modal === 'withdraw' && (
        <div className="fixed inset-0 z-50 bg-ak-navy/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="ak-font bg-ak-card rounded-[13px] w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-ak-text font-bold text-base">{t('wallet.withdraw')}</h2>
              <button onClick={closeModal} className="w-11 h-11 -m-2 flex items-center justify-center text-ak-text-muted">
                <X size={20} />
              </button>
            </div>

            {wallet && (
              <p className="text-xs text-ak-text-muted">{t('wallet.limits', { min: wallet.minWithdrawalUsdt, max: wallet.maxWithdrawalUsdt })}</p>
            )}

            {confirming ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-[13px] bg-ak-gold/10 border border-ak-gold/40 px-3 py-2.5">
                  <AlertTriangle size={16} className="text-ak-gold shrink-0 mt-0.5" />
                  <div className="text-xs text-ak-text">
                    <div className="font-bold mb-1">{t('wallet.confirmHeading')}</div>
                    <div>{t('wallet.confirmBody', { amount, chain: CHAIN_LABEL[chain] })}</div>
                    <div className="mt-1 font-mono break-all text-ak-text-muted">{payoutAddress.trim()}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-full bg-ak-bg disabled:opacity-40 text-ak-text font-bold text-sm transition-colors"
                  >
                    {t('wallet.editButton')}
                  </button>
                  <button
                    onClick={submitWithdraw}
                    disabled={submitting || !wallet?.enabled}
                    className="flex-1 py-2.5 rounded-full bg-ak-navy disabled:opacity-40 text-white font-bold text-sm transition-colors"
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
                  className="w-full bg-ak-bg rounded-[13px] px-3 py-2.5 text-sm outline-none border border-transparent focus:border-ak-navy/30 text-ak-text"
                />
                <input
                  type="text"
                  value={payoutAddress}
                  onChange={(e) => { setPayoutAddress(e.target.value); setAddressError(false); }}
                  placeholder={t('wallet.payoutAddressPlaceholder')}
                  className={
                    'w-full bg-ak-bg rounded-[13px] px-3 py-2.5 text-sm outline-none border text-ak-text focus:border-ak-navy/30 ' +
                    (addressError ? 'border-ak-red/60' : 'border-transparent')
                  }
                />
                {addressError && <p className="text-xs text-ak-red">{t('wallet.addressInvalid')}</p>}
                <button
                  onClick={startConfirm}
                  disabled={submitting || !wallet?.enabled}
                  className="w-full py-2.5 rounded-full bg-ak-navy disabled:opacity-40 text-white font-bold text-sm transition-colors"
                >
                  {t('wallet.submitWithdraw')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import { getAllChainAdapters, chainFamilyOf } from './chains/index.js';
import { getAllDepositAddresses, getDepositPrivateKey } from './walletService.js';
import { readDeposits, writeDeposits } from './depositsStorage.js';
import { paymentsBankroll } from './paymentsBankroll.js';
import { notifyPaymentsInbox } from './paymentsInbox.js';
import { usdtRawToChips, usdtRawToUsdt } from './exchange.js';
import { sweepDeposit } from './sweepService.js';
import type { DepositRecord, PaymentsSettings, ResponsibleGamblingSettings, WalletMapping } from '@poker-room/shared';
import { getResponsibleGamblingState, markResponsibleGamblingWarned } from '../auth/auth.js';
import { periodRange, isLimitCrossed } from '../game/responsibleGamblingService.js';

const NO_RG_SETTINGS: ResponsibleGamblingSettings = {
  depositLimitEnabled: false,
  lossLimitEnabled: false,
  sessionTimeLimitEnabled: false,
  selfExclusionEnabled: false,
  timeoutEnabled: false,
};

// Сумма зачисленных депозитов юзера в периоде [sinceMs, untilMs] — для лимита на депозит.
// Экспортируется — используется также в responsibleGambling.routes.ts для прогресс-бара.
export function depositsTotalChips(deposits: DepositRecord[], userId: string, sinceMs: number, untilMs: number): number {
  let total = 0;
  for (const d of deposits) {
    if (d.userId !== userId) continue;
    const t = new Date(d.creditedAt).getTime();
    if (t < sinceMs || t > untilMs) continue;
    total += d.amountChipsCredited;
  }
  return total;
}

// Перенос реально пришедших USDT с депозитного адреса на хот-кошелёк — отдельно от кредита чипов,
// чтобы сбой свипа (нет сети/нехватка газа) не откатывал уже начисленный баланс. Неудачный свип
// помечается swept:false и повторяется на следующих тиках (см. вызовы ниже).
async function trySweep(deposit: DepositRecord, wallets: WalletMapping[]): Promise<boolean> {
  try {
    const wallet = wallets.find((w) => w.address === deposit.address && chainFamilyOf(deposit.chain) === w.chainFamily);
    if (!wallet) return false;
    const privateKey = getDepositPrivateKey(wallet);
    if (!privateKey) return false;
    const result = await sweepDeposit(deposit.chain, deposit.address, privateKey, BigInt(deposit.amountUsdtRaw));
    if ('error' in result) {
      console.error(`⚠️ [payments] свип не удался ${deposit.chain} ${deposit.address}:`, result.error);
      return false;
    }
    deposit.swept = true;
    deposit.sweepTxid = result.txid;
    return true;
  } catch (err) {
    // Свип — best-effort; ошибка здесь НИКОГДА не должна откатывать уже начисленный кредит чипов
    // или терять запись депозита (см. вызовы в pollOnce — trySweep идёт до deposits.push).
    console.error(`⚠️ [payments] свип упал с исключением ${deposit.chain} ${deposit.address}:`, err);
    return false;
  }
}

let timer: NodeJS.Timeout | null = null;

// Один проход опроса: все сконфигурированные сети × все известные депозитные адреса.
// Ошибка на одном адресе/сети не должна прерывать остальные (try/catch внутри цикла) —
// иначе один сбойный RPC-вызов остановил бы зачисление депозитов всем другим игрокам.
export async function pollOnce(
  getSettings: () => PaymentsSettings,
  getRgSettings: () => ResponsibleGamblingSettings = () => NO_RG_SETTINGS,
): Promise<void> {
  const settings = getSettings();
  if (!settings.enabled) return;

  const deposits = readDeposits();
  let changed = false;
  const allWallets = [...getAllDepositAddresses('tron'), ...getAllDepositAddresses('evm')];

  // Ретрай свипа для записей, где предыдущая попытка не удалась (нет сети/нехватка газа на тот момент).
  for (const deposit of deposits) {
    if (deposit.swept) continue;
    try {
      if (await trySweep(deposit, allWallets)) changed = true;
    } catch (err) {
      console.error(`⚠️ [payments] повторный свип не удался ${deposit.chain} ${deposit.address}:`, err);
    }
  }

  for (const { chain, adapter } of getAllChainAdapters()) {
    const chainSettings = settings.chains[chain];
    if (!chainSettings?.enabled) continue;

    const wallets = getAllDepositAddresses(chainFamilyOf(chain));
    for (const wallet of wallets) {
      try {
        const transfers = await adapter.getIncomingUsdtTransfers(wallet.address, chainSettings.minConfirmations);
        for (const t of transfers) {
          if (!t.confirmed) continue;
          // Идемпотентность: один и тот же (chain, txid) кредитуется ровно один раз.
          if (deposits.some((d) => d.chain === chain && d.txid === t.txid)) continue;

          const amountChips = usdtRawToChips(t.amountRaw, settings.exchangeRateCentsPerUsdt);
          if (amountChips <= 0) continue;

          const current = paymentsBankroll.getUserChips(wallet.userId);
          if (current === null) continue; // юзер не найден — перепроверим на следующем тике, не теряем запись

          paymentsBankroll.persistChips(wallet.userId, current + amountChips);
          const deposit: DepositRecord = {
            txid: t.txid,
            chain,
            userId: wallet.userId,
            address: wallet.address,
            amountUsdtRaw: t.amountRaw.toString(),
            amountChipsCredited: amountChips,
            blockNumber: t.blockNumber,
            creditedAt: new Date().toISOString(),
            swept: false,
          };
          // Свип — best-effort прямо здесь же; неудача не теряет депозит (см. ретрай выше).
          await trySweep(deposit, wallets);
          deposits.push(deposit);
          changed = true;
          notifyPaymentsInbox(wallet.userId, 'deposit', `Депозит зачислен: ${usdtRawToUsdt(t.amountRaw).toFixed(2)} USDT`);

          // Лимит на депозит (ROADMAP §11.2) — только предупреждение, кредит чипов уже применён выше.
          if (getRgSettings().depositLimitEnabled) {
            const rg = getResponsibleGamblingState(wallet.userId);
            if (rg.depositLimitCents) {
              const { sinceMs, untilMs, key } = periodRange(rg.depositLimitPeriod ?? 'day', new Date());
              const totalChips = depositsTotalChips(deposits, wallet.userId, sinceMs, untilMs);
              if (isLimitCrossed(totalChips, rg.depositLimitCents) && rg.depositWarnedPeriodKey !== key) {
                notifyPaymentsInbox(wallet.userId, 'rg-warning', 'Вы превысили установленный лимит на депозит.');
                markResponsibleGamblingWarned(wallet.userId, 'deposit', key);
              }
            }
          }
        }
      } catch (err) {
        console.error(`⚠️ [payments] ошибка опроса ${chain} ${wallet.address}:`, err);
      }
    }
  }

  if (changed) writeDeposits(deposits);
}

export function start(
  intervalMs: number,
  getSettings: () => PaymentsSettings,
  getRgSettings?: () => ResponsibleGamblingSettings,
): void {
  stop();
  timer = setInterval(() => {
    pollOnce(getSettings, getRgSettings).catch((err) => console.error('⚠️ [payments] depositPollingService tick упал:', err));
  }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

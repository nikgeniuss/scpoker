import { getAllChainAdapters, chainFamilyOf } from './chains/index.js';
import { getAllDepositAddresses, getDepositPrivateKey } from './walletService.js';
import { readDeposits, writeDeposits } from './depositsStorage.js';
import { paymentsBankroll } from './paymentsBankroll.js';
import { notifyPaymentsInbox } from './paymentsInbox.js';
import { usdtRawToChips, usdtRawToUsdt } from './exchange.js';
import { sweepDeposit } from './sweepService.js';
import type { DepositRecord, PaymentsSettings, WalletMapping } from '@poker-room/shared';

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
export async function pollOnce(getSettings: () => PaymentsSettings): Promise<void> {
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
        }
      } catch (err) {
        console.error(`⚠️ [payments] ошибка опроса ${chain} ${wallet.address}:`, err);
      }
    }
  }

  if (changed) writeDeposits(deposits);
}

export function start(intervalMs: number, getSettings: () => PaymentsSettings): void {
  stop();
  timer = setInterval(() => {
    pollOnce(getSettings).catch((err) => console.error('⚠️ [payments] depositPollingService tick упал:', err));
  }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

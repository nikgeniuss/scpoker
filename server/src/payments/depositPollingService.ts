import { getAllChainAdapters, chainFamilyOf } from './chains/index.js';
import { getAllDepositAddresses, getDepositPrivateKey } from './walletService.js';
import { readDeposits, writeDeposits } from './depositsStorage.js';
import { readCursors, writeCursors, cursorKey } from './depositCursorStorage.js';
import { paymentsBankroll } from './paymentsBankroll.js';
import { notifyPaymentsInbox } from './paymentsInbox.js';
import { usdtRawToChips, usdtRawToUsdt } from './exchange.js';
import { sweepDeposit } from './sweepService.js';
import type { DepositRecord, PaymentsSettings, ResponsibleGamblingSettings, WalletMapping } from '@poker-room/shared';
import { getResponsibleGamblingState, markResponsibleGamblingWarned } from '../auth/auth.js';
import { periodRange, isLimitCrossed } from '../game/responsibleGamblingService.js';
import { grantForDeposit as grantDepositBonus } from '../game/depositBonusService.js';

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
    // или терять запись депозита (см. вызовы в runPoll — запись фиксируется ДО свипа).
    console.error(`⚠️ [payments] свип упал с исключением ${deposit.chain} ${deposit.address}:`, err);
    return false;
  }
}

let timer: NodeJS.Timeout | null = null;

// Guard от наложения циклов опроса. Свип ждёт подтверждения фандинга газа до ~60с
// (FUND_POLL_INTERVAL_MS * FUND_POLL_MAX_ATTEMPTS в sweepService.ts), а тик планировщика приходит
// каждые 30с (index.ts) — без этого флага второй тик стартовал ВНУТРИ первого, читал ещё не
// дописанный deposits.json, считал уже зачисленный перевод новым и начислял чипы ПОВТОРНО.
let polling = false;

// Один проход опроса: все сконфигурированные сети × все известные депозитные адреса.
// Ошибка на одном адресе/сети не должна прерывать остальные (try/catch внутри цикла) —
// иначе один сбойный RPC-вызов остановил бы зачисление депозитов всем другим игрокам.
export async function pollOnce(
  getSettings: () => PaymentsSettings,
  getRgSettings: () => ResponsibleGamblingSettings = () => NO_RG_SETTINGS,
): Promise<void> {
  if (polling) {
    console.warn('⏭️ [payments] предыдущий цикл опроса ещё не завершён — тик пропущен');
    return;
  }
  polling = true;
  try {
    await runPoll(getSettings, getRgSettings);
  } finally {
    polling = false;
  }
}

async function runPoll(
  getSettings: () => PaymentsSettings,
  getRgSettings: () => ResponsibleGamblingSettings,
): Promise<void> {
  const settings = getSettings();
  if (!settings.enabled) return;

  const deposits = readDeposits();
  const cursors = readCursors(); // читаем один раз на проход, пишем по мере продвижения адресов
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
      const cursorId = cursorKey(chain, wallet.address);
      try {
        const { transfers, scannedToBlock } = await adapter.getIncomingUsdtTransfers(
          wallet.address,
          chainSettings.minConfirmations,
          cursors[cursorId],
        );
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
          // Запись фиксируется СРАЗУ, до свипа: между начислением чипов и попаданием записи в
          // deposits.json не должно быть ни одного await — иначе это окно (на свипе до минуты)
          // переживает рестарт процесса, и тот же перевод зачисляется повторно.
          deposits.push(deposit);
          writeDeposits(deposits);
          changed = true;
          // Свип — best-effort прямо здесь же; неудача не теряет депозит (см. ретрай выше).
          await trySweep(deposit, wallets);
          notifyPaymentsInbox(wallet.userId, 'deposit', `Депозит зачислен: ${usdtRawToUsdt(t.amountRaw).toFixed(2)} USDT`);

          // Депозитный бонус (§10.21.9). Сервис сам решает, положен ли бонус (выключен/мал депозит/
          // нулевой процент) и по какой ставке. Первым считается депозит, до которого записей этого
          // игрока не было — текущая уже добавлена в массив выше, поэтому сравнение с единицей.
          const isFirstDeposit = deposits.filter((d) => d.userId === wallet.userId).length === 1;
          grantDepositBonus(wallet.userId, amountChips, isFirstDeposit, t.txid);

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

        // Курсор двигаем только после того, как ВСЕ переводы адреса обработаны: исключение выше
        // оставит его на месте, и следующий тик пересканирует диапазон заново (повторного
        // зачисления при этом не будет — дедуп по (chain, txid) выше). Пишем сразу, а не в конце
        // прохода: writeJSON дебаунсится 200мс и всё равно схлопнет записи в одну.
        if (scannedToBlock !== null) {
          cursors[cursorId] = scannedToBlock;
          writeCursors(cursors);
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

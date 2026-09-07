import { randomUUID } from 'crypto';
import { readWithdrawals, writeWithdrawals } from './withdrawalsStorage.js';
import { getChainAdapter } from './chains/index.js';
import { paymentsBankroll } from './paymentsBankroll.js';
import { usdtToUsdtRaw, usdtRawToChips, chipsToUsdtRaw } from './exchange.js';
import type { PaymentChain, PaymentsSettings, WithdrawalRequest } from '@poker-room/shared';

type ServiceError = { error: string };

// Машина состояний: pending → approved → sending → paid
//                       ↘ rejected            ↘ failed (откат дебета)
// Переходы — строго по этому графу, каждая функция идемпотентно проверяет текущий статус
// перед мутацией (образец clubService.ts — без re-check можно дважды отправить реальные деньги).

export function createWithdrawalRequest(
  userId: string,
  username: string,
  chain: PaymentChain,
  amountUsdt: number,
  payoutAddress: string,
  settings: PaymentsSettings,
): WithdrawalRequest | ServiceError {
  if (!settings.enabled || !settings.chains[chain]?.enabled) return { error: 'payments-disabled' };
  const adapter = getChainAdapter(chain);
  if (!adapter) return { error: 'chain-not-configured' };
  if (!adapter.isValidAddress(payoutAddress)) return { error: 'invalid-address' };
  if (
    !Number.isFinite(amountUsdt) ||
    amountUsdt < settings.minWithdrawalUsdt ||
    amountUsdt > settings.maxWithdrawalUsdt
  ) {
    return { error: `amount-out-of-range:${settings.minWithdrawalUsdt}-${settings.maxWithdrawalUsdt}` };
  }

  const requestedRaw = usdtToUsdtRaw(amountUsdt);
  const amountChips = usdtRawToChips(requestedRaw, settings.exchangeRateCentsPerUsdt);
  if (amountChips <= 0) return { error: 'amount-too-small' };
  // Отправляем ровно столько USDT, сколько покрыто списанными фишками. Обе конвертации округляют
  // вниз, поэтому запрошенная сумма могла быть на доли цента БОЛЬШЕ списания — эта разница уходила
  // из кассы при каждом выводе (найдено security review 2026-08-24).
  const amountUsdtRaw = chipsToUsdtRaw(amountChips, settings.exchangeRateCentsPerUsdt);

  const currentChips = paymentsBankroll.getUserChips(userId);
  if (currentChips === null) return { error: 'user-not-found' };
  if (currentChips < amountChips) return { error: 'insufficient-balance' };

  // Дебет немедленно — баланс в users.json это именно "свободные" фишки вне игры (см. план §11.1),
  // блокировать средства сразу, иначе пользователь успеет потратить их за столом до approve.
  paymentsBankroll.persistChips(userId, currentChips - amountChips);

  const record: WithdrawalRequest = {
    id: randomUUID(),
    userId,
    username,
    chain,
    amountChips,
    amountUsdtRaw: amountUsdtRaw.toString(),
    payoutAddress,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const all = readWithdrawals();
  all.push(record);
  writeWithdrawals(all);
  return record;
}

function transition(
  id: string,
  fromStatuses: WithdrawalRequest['status'][],
  apply: (w: WithdrawalRequest) => void,
): WithdrawalRequest | ServiceError {
  const all = readWithdrawals();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return { error: 'not-found' };
  if (!fromStatuses.includes(all[idx].status)) {
    return { error: `invalid-status-transition:${all[idx].status}` };
  }
  apply(all[idx]);
  writeWithdrawals(all);
  return all[idx];
}

function refund(w: WithdrawalRequest): void {
  const current = paymentsBankroll.getUserChips(w.userId);
  if (current !== null) {
    paymentsBankroll.persistChips(w.userId, current + w.amountChips);
  }
}

export function approveWithdrawal(id: string, adminId: string): WithdrawalRequest | ServiceError {
  return transition(id, ['pending'], (w) => {
    w.status = 'approved';
    w.resolvedBy = adminId;
    w.resolvedAt = new Date().toISOString();
  });
}

export function rejectWithdrawal(id: string, adminId: string, reason?: string): WithdrawalRequest | ServiceError {
  const all = readWithdrawals();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return { error: 'not-found' };
  if (all[idx].status !== 'pending') return { error: `invalid-status-transition:${all[idx].status}` };
  refund(all[idx]);
  all[idx].status = 'rejected';
  all[idx].resolvedBy = adminId;
  all[idx].resolvedAt = new Date().toISOString();
  all[idx].failReason = reason;
  writeWithdrawals(all);
  return all[idx];
}

// Помечает 'sending' СИНХРОННО до вызова adapter.sendUsdt — если сервер падает между этим
// вызовом и markPaid/markFailed, заявка остаётся в 'sending' и ждёт ручной проверки админом
// (не авто-ретрай: нельзя слепо повторить отправку реальных денег, см. план §11.1).
export function markSending(id: string): WithdrawalRequest | ServiceError {
  return transition(id, ['approved'], (w) => {
    w.status = 'sending';
  });
}

export function markPaid(id: string, txid: string): WithdrawalRequest | ServiceError {
  return transition(id, ['sending'], (w) => {
    w.status = 'paid';
    w.txid = txid;
    w.resolvedAt = new Date().toISOString();
  });
}

export function markFailed(id: string, reason: string): WithdrawalRequest | ServiceError {
  const all = readWithdrawals();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return { error: 'not-found' };
  if (all[idx].status !== 'sending') return { error: `invalid-status-transition:${all[idx].status}` };
  refund(all[idx]);
  all[idx].status = 'failed';
  all[idx].failReason = reason;
  all[idx].resolvedAt = new Date().toISOString();
  writeWithdrawals(all);
  return all[idx];
}

export function getWithdrawalsQueue(status?: WithdrawalRequest['status']): WithdrawalRequest[] {
  const all = readWithdrawals();
  return status ? all.filter((w) => w.status === status) : all;
}

export function getWithdrawalById(id: string): WithdrawalRequest | null {
  return readWithdrawals().find((w) => w.id === id) ?? null;
}

export function getUserWithdrawalHistory(userId: string): WithdrawalRequest[] {
  return readWithdrawals()
    .filter((w) => w.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

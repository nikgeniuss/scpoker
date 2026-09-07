import { describe, it, expect } from 'vitest';
import type { DepositRecord, WithdrawalRequest } from '@poker-room/shared';
import { toCsv, csvFileName, showDeposits, showWithdrawals } from './paymentHistory';

// Фильтр и выгрузка истории платежей (ROADMAP §11.1).

const deposit = (over: Partial<DepositRecord> = {}): DepositRecord => ({
  txid: 'tx-dep-1',
  chain: 'tron',
  userId: 'u1',
  address: 'Taddr',
  amountUsdtRaw: '10500000', // 10.5 USDT
  amountChipsCredited: 1050,
  blockNumber: 1,
  creditedAt: '2026-09-01T10:00:00.000Z',
  swept: true,
  ...over,
});

const withdrawal = (over: Partial<WithdrawalRequest> = {}): WithdrawalRequest => ({
  id: 'w1',
  userId: 'u1',
  username: 'Player',
  chain: 'ethereum',
  amountChips: 500,
  amountUsdtRaw: '5000000', // 5 USDT
  payoutAddress: '0xabc',
  status: 'paid',
  createdAt: '2026-09-02T10:00:00.000Z',
  txid: 'tx-wd-1',
  ...over,
});

const lines = (csv: string) => csv.split('\n');

describe('фильтр истории', () => {
  it('«Все» показывает обе стороны', () => {
    expect(showDeposits('all')).toBe(true);
    expect(showWithdrawals('all')).toBe(true);
  });

  it('фильтр по типу прячет вторую сторону', () => {
    expect(showDeposits('withdrawals')).toBe(false);
    expect(showWithdrawals('deposits')).toBe(false);
  });
});

describe('toCsv', () => {
  it('заголовок и по строке на операцию', () => {
    const csv = toCsv([deposit()], [withdrawal()]);
    expect(lines(csv)).toHaveLength(3);
    expect(lines(csv)[0]).toContain('date');
    expect(lines(csv)[0]).toContain('amount_usdt');
  });

  it('свежие операции сверху', () => {
    const csv = toCsv([deposit()], [withdrawal()]); // вывод на день позже депозита
    expect(lines(csv)[1]).toContain('withdrawal');
    expect(lines(csv)[2]).toContain('deposit');
  });

  it('сырые USDT переводятся в читаемую сумму', () => {
    expect(toCsv([deposit()], [])).toContain('"10.500000"');
  });

  it('фильтр применяется и к выгрузке — выгружается то, что видно на экране', () => {
    expect(toCsv([deposit()], [withdrawal()], 'deposits')).not.toContain('withdrawal');
    expect(toCsv([deposit()], [withdrawal()], 'withdrawals')).not.toContain('"deposit"');
  });

  it('кавычки в данных экранируются — колонки не разъезжаются', () => {
    const csv = toCsv([], [withdrawal({ status: 'failed', txid: 'a"b' })]);
    expect(csv).toContain('"a""b"');
  });

  it('вывод без txid не ломает строку — пустая ячейка', () => {
    const csv = toCsv([], [withdrawal({ txid: undefined, status: 'pending' })]);
    expect(lines(csv)[1].endsWith(',""')).toBe(true);
  });

  it('пустая история — только заголовок', () => {
    expect(lines(toCsv([], []))).toHaveLength(1);
  });
});

describe('csvFileName', () => {
  it('имя файла содержит дату выгрузки', () => {
    expect(csvFileName(new Date('2026-09-06T12:00:00.000Z'))).toBe('poker-hub-payments-2026-09-06.csv');
  });
});

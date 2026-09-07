import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Wallet } from './Wallet';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import type { WithdrawalRequest, WithdrawalStatus } from '@poker-room/shared';

// Critique 2026-08-12 (impeccable): P0 confirm-шаг перед необратимым выводом,
// P1 цветовое кодирование статусов вывода.

const WALLET_INFO = {
  enabled: true,
  exchangeRateCentsPerUsdt: 100,
  minWithdrawalUsdt: 5,
  maxWithdrawalUsdt: 1000,
  chains: {
    tron: { enabled: false, address: null },
    ethereum: { enabled: true, address: '0x' + 'a'.repeat(40) },
    bsc: { enabled: false, address: null },
  },
};

const VALID_ADDRESS = '0x' + '1'.repeat(40);

function withdrawal(status: WithdrawalStatus, id: string, createdAt: string): WithdrawalRequest {
  return {
    id,
    userId: 'u1',
    username: 'Player',
    chain: 'ethereum',
    amountChips: 1000,
    amountUsdtRaw: '10000000',
    payoutAddress: VALID_ADDRESS,
    status,
    createdAt,
  };
}

function renderWallet() {
  return render(
    <MemoryRouter>
      <Wallet />
    </MemoryRouter>,
  );
}

describe('<Wallet />', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: { id: 'me', username: 'Me', role: 'user' }, isAdmin: false });
  });

  afterEach(() => {
    useWalletStore.setState({
      wallet: null,
      deposits: [],
      withdrawals: [],
      loaded: false,
      loading: false,
      fetchWallet: async () => {},
      fetchHistory: async () => {},
      requestWithdrawal: async () => ({ ok: true }),
    });
  });

  it('клик по «Подать заявку на вывод» — не отправляет запрос сразу, а показывает подтверждение', () => {
    const requestWithdrawal = vi.fn(async () => ({ ok: true as const }));
    useWalletStore.setState({
      wallet: WALLET_INFO, deposits: [], withdrawals: [], loaded: true, loading: false,
      fetchWallet: async () => {}, fetchHistory: async () => {}, requestWithdrawal,
    });

    renderWallet();
    fireEvent.change(screen.getByPlaceholderText('Сумма (USDT)'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('Адрес кошелька в выбранной сети'), { target: { value: VALID_ADDRESS } });
    fireEvent.click(screen.getByText('Подать заявку на вывод'));

    expect(screen.getByText('Проверьте перед отправкой — вывод необратим')).toBeInTheDocument();
    expect(requestWithdrawal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Подтвердить вывод'));
    expect(requestWithdrawal).toHaveBeenCalledWith('tok', 'ethereum', 10, VALID_ADDRESS);
  });

  it('невалидный адрес — показывает ошибку формата и не переходит к подтверждению', () => {
    const requestWithdrawal = vi.fn(async () => ({ ok: true as const }));
    useWalletStore.setState({
      wallet: WALLET_INFO, deposits: [], withdrawals: [], loaded: true, loading: false,
      fetchWallet: async () => {}, fetchHistory: async () => {}, requestWithdrawal,
    });

    renderWallet();
    fireEvent.change(screen.getByPlaceholderText('Сумма (USDT)'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('Адрес кошелька в выбранной сети'), { target: { value: '0x123' } });
    fireEvent.click(screen.getByText('Подать заявку на вывод'));

    expect(screen.getByText('Проверьте формат адреса для выбранной сети')).toBeInTheDocument();
    expect(screen.queryByText('Проверьте перед отправкой — вывод необратим')).not.toBeInTheDocument();
    expect(requestWithdrawal).not.toHaveBeenCalled();
  });

  it('статус «Отклонено» — красный, «Выплачено» — зелёный (не одинаковый нейтральный цвет)', () => {
    useWalletStore.setState({
      wallet: WALLET_INFO,
      deposits: [],
      withdrawals: [
        withdrawal('rejected', 'w1', '2026-01-01T00:00:00.000Z'),
        withdrawal('paid', 'w2', '2026-01-02T00:00:00.000Z'),
      ],
      loaded: true, loading: false,
      fetchWallet: async () => {}, fetchHistory: async () => {}, requestWithdrawal: async () => ({ ok: true }),
    });

    renderWallet();

    expect(screen.getByText('Отклонено').className).toContain('text-red-400');
    expect(screen.getByText('Выплачено').className).toContain('text-emerald-400');
  });
});

// Фильтр истории платежей (ROADMAP §11.1): раньше депозиты и выводы шли одним общим списком
// без возможности разделить их.
describe('<Wallet /> — фильтр истории', () => {
  const deposit = {
    txid: 'tx1', chain: 'ethereum' as const, userId: 'u1', address: '0xdep',
    amountUsdtRaw: '10000000', amountChipsCredited: 1000, blockNumber: 1,
    creditedAt: '2026-01-02T00:00:00.000Z', swept: true,
  };

  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', user: { id: 'u1', username: 'Me', role: 'user' }, isAdmin: false });
    useWalletStore.setState({
      wallet: WALLET_INFO,
      deposits: [deposit],
      withdrawals: [withdrawal('paid', 'w1', '2026-01-01T00:00:00.000Z')],
      loaded: true, loading: false,
      fetchWallet: async () => {}, fetchHistory: async () => {}, requestWithdrawal: async () => ({ ok: true }),
    });
  });

  it('по умолчанию видны обе стороны истории', () => {
    renderWallet();
    expect(screen.getByText(/Депозит/)).toBeInTheDocument();
    expect(screen.getByText(/Вывод .* фишек/)).toBeInTheDocument();
  });

  it('фильтр «Пополнения» скрывает выводы', () => {
    renderWallet();
    fireEvent.click(screen.getByText('Пополнения'));
    expect(screen.getByText(/Депозит/)).toBeInTheDocument();
    expect(screen.queryByText(/Вывод .* фишек/)).toBeNull();
  });

  it('фильтр «Выводы» скрывает пополнения', () => {
    renderWallet();
    fireEvent.click(screen.getByText('Выводы'));
    expect(screen.queryByText(/Депозит/)).toBeNull();
    expect(screen.getByText(/Вывод .* фишек/)).toBeInTheDocument();
  });

  it('пустая история — кнопка выгрузки заблокирована', () => {
    useWalletStore.setState({ deposits: [], withdrawals: [] });
    renderWallet();
    expect(screen.getByText('Выгрузить')).toBeDisabled();
  });
});

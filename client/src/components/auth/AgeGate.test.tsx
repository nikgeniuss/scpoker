import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgeGate } from './AgeGate';
import { useAuthStore } from '../../store/authStore';

// Возрастной гейт 18+ (§11.2): форма доввода даты рождения. Реальная защита — серверная
// (completeDobGate), здесь проверяется, что клиент не пропускает шаг мимо сервера.

describe('<AgeGate />', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, isAdmin: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('пустая дата — запрос на сервер не уходит', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<AgeGate pendingToken="pt" onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Продолжить'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Укажите дату рождения')).toBeInTheDocument();
  });

  it('успешный ответ — дата уходит на /auth/dob, вход завершается', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: 'tok', user: { id: 'u1', username: 'alice', role: 'player' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();

    render(<AgeGate pendingToken="pt" onCancel={() => {}} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '1990-01-01' } });
    fireEvent.click(screen.getByText('Продолжить'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/dob');
    expect(JSON.parse(init.body as string)).toMatchObject({ pendingToken: 'pt', dateOfBirth: '1990-01-01' });
    expect(useAuthStore.getState().token).toBe('tok');
  });

  it('отказ сервера (несовершеннолетний) — вход не выполняется, показана причина', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Вход доступен только для лиц старше 18 лет' }),
    })));
    const onDone = vi.fn();

    render(<AgeGate pendingToken="pt" onCancel={() => {}} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '2015-01-01' } });
    fireEvent.click(screen.getByText('Продолжить'));

    expect(await screen.findByText('Вход доступен только для лиц старше 18 лет')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });
});

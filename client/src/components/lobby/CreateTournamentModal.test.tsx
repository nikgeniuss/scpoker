import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CreateTournamentModal } from './CreateTournamentModal';
import type { CreateTournamentOptions } from '@poker-room/shared';

// Стартовый стек теперь задаётся в BB, а не в фишках — фактический startingStack (для сервера)
// вычисляется на клиенте как startingBigBlind × стек-в-BB (см. ROADMAP §10.19).
describe('<CreateTournamentModal /> — стартовый блайнд и стек в BB', () => {
  it('по умолчанию (25/50, 100bb) считает стек = 5000 и шлёт startingBigBlind=50', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    expect(screen.getByText('0.25 / 0.50')).toBeInTheDocument();
    expect(screen.getByText('= 50 фишек на старте')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit).toHaveBeenCalledOnce();
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(50);
    expect(opts.startingStack).toBe(5000);
  });

  it('переключение стартового блайнда на следующий уровень лестницы пересчитывает стек', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const blindRow = screen.getByText('Начальный блайнд').closest('div')!.parentElement!;
    fireEvent.click(within(blindRow).getByText('+')); // 25/50 → 50/100

    expect(screen.getByText('0.50 / 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(100);
    expect(opts.startingStack).toBe(10000); // 100 × 100bb
  });

  it('увеличение стека в BB пересчитывает фишки при том же блайнде', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const stackRow = screen.getByText('Стартовый стек, BB').closest('div')!.parentElement!;
    fireEvent.click(within(stackRow).getByText('+')); // 100 → 110

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.startingBigBlind).toBe(50);
    expect(opts.startingStack).toBe(5500); // 50 × 110
  });
});

// Настраиваемые параметры распределения приза «под любой стандарт» (см. ROADMAP §10.19, 2026-07-05):
// рейк (SNG+MTT), свободный ITM% (был жёсткий список 10/12/15/20), форма кривой payoutCurveExponent (MTT).
describe('<CreateTournamentModal /> — рейк, свободный ITM% и форма кривой распределения', () => {
  it('рейк по умолчанию 0% — не попадает в опции (обратная совместимость)', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].rakePercent).toBeUndefined();
  });

  it('увеличение рейка передаётся в опции (доступно и для SNG)', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const rakeRow = screen.getByText('Рейк, %').closest('div')!.parentElement!;
    fireEvent.click(within(rakeRow).getByText('+'));
    fireEvent.click(within(rakeRow).getByText('+'));
    fireEvent.click(within(rakeRow).getByText('+'));

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].rakePercent).toBe(3);
  });

  it('MTT: ITM% свободно настраивается за пределы старого фиксированного списка [10,12,15,20]', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const typeRow = screen.getByText('Тип турнира').closest('div')!.parentElement!;
    fireEvent.click(within(typeRow).getByText('MTT (мультистол)'));

    const itmRow = screen.getByText('ITM%').closest('div')!.parentElement!;
    // Дефолт 15% → +18 кликов = 33% (значение вне старого фиксированного набора).
    for (let i = 0; i < 18; i++) fireEvent.click(within(itmRow).getByText('+'));
    expect(screen.getByText('33%')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].itmPercent).toBe(33);
  });

  it('MTT: форма распределения приза (payoutCurveExponent) — дефолт 1.0, настраивается степпером', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const typeRow = screen.getByText('Тип турнира').closest('div')!.parentElement!;
    fireEvent.click(within(typeRow).getByText('MTT (мультистол)'));

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].payoutCurveExponent).toBe(1);
  });
});

// Запланированный старт (ROADMAP §10.19, 2026-07-07): регистрация открывается/турнир стартует в
// заданное время вместо старого поведения (SNG по заполнению, MTT только вручную).
describe('<CreateTournamentModal /> — запланированный старт (regOpensAt/scheduledStartAt)', () => {
  it('по умолчанию выключено — оба поля не попадают в опции', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].regOpensAt).toBeUndefined();
    expect(onSubmit.mock.calls[0][0].scheduledStartAt).toBeUndefined();
  });

  it('включение тоггла + заполнение обоих полей передаёт timestamp в опции', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const scheduleRow = screen.getByText('Запланировать старт').closest('div')!.parentElement!;
    fireEvent.click(within(scheduleRow).getByRole('button', { pressed: false }));

    const regInput = screen.getByLabelText('Открытие регистрации') as HTMLInputElement;
    const startInput = screen.getByLabelText('Старт турнира') as HTMLInputElement;
    fireEvent.change(regInput, { target: { value: '2026-08-01T12:00' } });
    fireEvent.change(startInput, { target: { value: '2026-08-01T13:00' } });

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.regOpensAt).toBe(new Date('2026-08-01T12:00').getTime());
    expect(opts.scheduledStartAt).toBe(new Date('2026-08-01T13:00').getTime());
  });

  it('тогл включён, но поля пустые — опции не отправляются (обратная совместимость)', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const scheduleRow = screen.getByText('Запланировать старт').closest('div')!.parentElement!;
    fireEvent.click(within(scheduleRow).getByRole('button', { pressed: false }));
    fireEvent.click(screen.getByText('Создать'));

    expect(onSubmit.mock.calls[0][0].regOpensAt).toBeUndefined();
    expect(onSubmit.mock.calls[0][0].scheduledStartAt).toBeUndefined();
  });
});

// Незаметное заполнение турниров ботами (ROADMAP §10.19, 2026-07-09): тумблер + поле итогового
// числа ботов (появляется только при включении), отдельно от debug-инструмента «тестовых ботов».
describe('<CreateTournamentModal /> — заполнение ботами (fillWithBots)', () => {
  it('по умолчанию выключено — fillWithBots=false, botFillTarget не отправляется, поле числа скрыто', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    expect(screen.queryByText('Итоговое число ботов')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.fillWithBots).toBe(false);
    expect(opts.botFillTarget).toBeUndefined();
  });

  it('включение тоггла показывает поле числа (дефолт 10) и передаёт его в опции', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const fillRow = screen.getByText('Заполнить ботами').closest('div')!.parentElement!;
    fireEvent.click(within(fillRow).getByRole('button', { pressed: false }));

    expect(screen.getByText('Итоговое число ботов')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Создать'));
    const opts = onSubmit.mock.calls[0][0];
    expect(opts.fillWithBots).toBe(true);
    expect(opts.botFillTarget).toBe(10);
  });

  it('степпер меняет итоговое число ботов', () => {
    const onSubmit = vi.fn<(opts: CreateTournamentOptions) => void>();
    render(<CreateTournamentModal onClose={() => {}} onSubmit={onSubmit} />);

    const fillRow = screen.getByText('Заполнить ботами').closest('div')!.parentElement!;
    fireEvent.click(within(fillRow).getByRole('button', { pressed: false }));

    const countRow = screen.getByText('Итоговое число ботов').closest('div')!.parentElement!;
    fireEvent.click(within(countRow).getByText('+'));
    fireEvent.click(within(countRow).getByText('+'));

    fireEvent.click(screen.getByText('Создать'));
    expect(onSubmit.mock.calls[0][0].botFillTarget).toBe(12);
  });
});

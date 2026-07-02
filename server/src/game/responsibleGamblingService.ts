// Чистые хелперы для Responsible Gambling (ROADMAP §11.2) — границы периода и проверка
// превышения лимита. Без io/файлового доступа — конкретные суммы (потери/депозиты)
// читаются вызывающим кодом (statsService / deposits.json) и передаются сюда.

export type RgPeriod = 'day' | 'week' | 'month';

export interface PeriodRange {
  sinceMs: number;
  untilMs: number;
  key: string; // стабильный идентификатор периода — для дедупа предупреждений
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Понедельник 00:00 UTC недели, в которую попадает `d` (ISO-неделя).
function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=вс..6=сб
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  return start;
}

// Граница и ключ периода, в который попадает `now` — день/неделя/месяц, UTC.
export function periodRange(period: RgPeriod, now: Date): PeriodRange {
  if (period === 'day') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { sinceMs: start.getTime(), untilMs: now.getTime(), key: `d:${isoDate(start)}` };
  }
  if (period === 'week') {
    const start = startOfIsoWeek(now);
    return { sinceMs: start.getTime(), untilMs: now.getTime(), key: `w:${isoDate(start)}` };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { sinceMs: start.getTime(), untilMs: now.getTime(), key: `m:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}` };
}

// totalCents — суммарная величина (потери как положительное число центов, либо сумма депозитов).
export function isLimitCrossed(totalCents: number, limitCents: number | undefined): boolean {
  if (!limitCents || limitCents <= 0) return false;
  return totalCents >= limitCents;
}

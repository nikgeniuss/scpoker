import { describe, it, expect } from 'vitest';
import { shouldSend, formatAlert } from '../alertService.js';

// Алерты (ROADMAP §11.3). Чистая часть: дедуп (крэш-луп не должен превратиться в сотни
// одинаковых сообщений и упереться в лимиты Telegram) и текст (по нему должно быть понятно,
// куда смотреть, без захода на машину).

const WINDOW = 10 * 60_000;

describe('shouldSend — дедуп одинаковых алертов', () => {
  it('первый алерт этого вида уходит всегда', () => {
    expect(shouldSend(undefined, 1_000, WINDOW)).toBe(true);
  });

  it('повтор внутри окна подавляется', () => {
    expect(shouldSend(1_000, 1_000 + WINDOW - 1, WINDOW)).toBe(false);
  });

  it('по истечении окна тот же алерт снова уходит', () => {
    expect(shouldSend(1_000, 1_000 + WINDOW, WINDOW)).toBe(true);
  });
});

describe('formatAlert', () => {
  it('в тексте есть вид алерта и время', () => {
    const msg = formatAlert('crash', 'Процесс завершается');
    expect(msg).toContain('[crash]');
    expect(msg).toContain('Процесс завершается');
    expect(msg).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('ошибка разворачивается в сообщение и верхушку стека', () => {
    const err = new Error('EPERM: operation not permitted');
    const msg = formatAlert('storage', 'Не удалась запись users.json', err);
    expect(msg).toContain('EPERM: operation not permitted');
    expect(msg.split('\n').length).toBeGreaterThan(2); // есть строки стека, а не только заголовок
  });

  it('не-Error причина не роняет форматирование', () => {
    expect(formatAlert('crash', 'rejection', 'просто строка')).toContain('просто строка');
  });

  it('у каждого вида свой значок — видно с одного взгляда в ленте', () => {
    const icons = (['crash', 'storage', 'backup', 'startup'] as const).map((k) => Array.from(formatAlert(k, 'x'))[0]);
    expect(new Set(icons).size).toBe(4);
  });
});

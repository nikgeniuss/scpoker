import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { apiErrorMessage } from './apiErrors';
import { ru } from '../i18n/locales/ru';
import { en } from '../i18n/locales/en';

// Переводы кодов ошибок сервера (ROADMAP §9.4): игрок видел в тосте технический код латиницей
// ('already-registered') независимо от языка интерфейса.

// Мини-подмена i18next: 'errors.<код>' → строка из словаря, иначе defaultValue.
const makeT = (dict: Record<string, string>): TFunction =>
  ((key: string, opts?: { defaultValue?: string }) => {
    const code = key.replace(/^errors\./, '');
    return dict[code] ?? opts?.defaultValue ?? key;
  }) as unknown as TFunction;

const tRu = makeT((ru as unknown as { errors: Record<string, string> }).errors);
const tEn = makeT((en as unknown as { errors: Record<string, string> }).errors);

describe('apiErrorMessage', () => {
  it('переводит известный код на язык интерфейса', () => {
    expect(apiErrorMessage('already-registered', tRu)).toBe('Вы уже зарегистрированы в этом турнире');
    expect(apiErrorMessage('already-registered', tEn)).toBe('You are already registered for this tournament');
  });

  it('незнакомый код показывает как есть — техническая строка полезнее пустого тоста', () => {
    expect(apiErrorMessage('invalid-payout-curve-exponent', tRu)).toBe('invalid-payout-curve-exponent');
  });

  it('незнакомый код с переданным запасным текстом показывает запасной', () => {
    expect(apiErrorMessage('какой-то-код', tRu, 'Не удалось')).toBe('Не удалось');
  });

  it('пустой код не роняет тост', () => {
    expect(apiErrorMessage(undefined, tRu)).toBe('Что-то пошло не так');
    expect(apiErrorMessage('', tEn, 'Failed')).toBe('Failed');
  });

  it('словари ru и en покрывают одни и те же коды — язык не теряет сообщений', () => {
    const ruKeys = Object.keys((ru as unknown as { errors: Record<string, string> }).errors).sort();
    const enKeys = Object.keys((en as unknown as { errors: Record<string, string> }).errors).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('коды регистрации в турнире переведены на обоих языках', () => {
    for (const code of ['late-reg-closed', 'insufficient-bankroll', 'reentry-limit-reached', 'promo-already-used']) {
      expect(apiErrorMessage(code, tRu)).not.toBe(code);
      expect(apiErrorMessage(code, tEn)).not.toBe(code);
    }
  });
});

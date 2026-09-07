import type { TFunction } from 'i18next';

// Единый перевод машинных кодов ошибок сервера (ROADMAP §9.4). Сервер отвечает кодами
// ('already-registered', 'insufficient-bankroll', 'late-reg-closed'), а клиент до этого показывал
// их игроку как есть — в тосте появлялась техническая строка латиницей независимо от языка UI.
// Сервер не локализован и локализован не будет: коды стабильны, переводить их — работа клиента.
// Тот же приём, что denyMessages.ts для joinDenied, только через i18n-ключи (errors.<код>).
//
// Незнакомый код (в основном админская валидация — админка сознательно не переводится, §9.4)
// показываем как есть: техническая строка полезнее пустого тоста.
export function apiErrorMessage(code: string | undefined, t: TFunction, fallback?: string): string {
  if (!code) return fallback ?? t('errors.unknown');
  const translated = t('errors.' + code, { defaultValue: '' });
  return translated || fallback || code;
}

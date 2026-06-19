// Единая точка доступа к Telegram Mini App SDK (window.Telegram.WebApp).
// Раньше useTelegram и TelegramAutoLogin читали window.Telegram по-разному (ROADMAP §9.3-F).

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string; // значение из ?startapp=... (для привязки аккаунта)
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  close: () => void;
  // Тактильная отдача — есть только при реальном запуске в Telegram (см. lib/haptic.ts).
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

// initData непуст ТОЛЬКО при реальном запуске внутри Telegram. SDK-скрипт делает WebApp
// существующим даже в обычном браузере, поэтому проверять надо именно initData (см. useTelegram).
export function getTelegramInitData(): string {
  const tg = getTelegramWebApp();
  return tg && typeof tg.initData === 'string' ? tg.initData : '';
}

export function isInTelegram(): boolean {
  return getTelegramInitData().length > 0;
}

// start_param из ?startapp=<code> — код привязки аккаунта (пусто, если не передан).
export function getTelegramStartParam(): string {
  const tg = getTelegramWebApp();
  const p = tg?.initDataUnsafe?.start_param;
  return typeof p === 'string' ? p : '';
}

// Бот/мини-апп зафиксированы для этого деплоя (pokerhubcity_bot / play).
const TG_MINI_APP = 'https://t.me/pokerhubcity_bot/play';

// Deep-link для открытия Mini App без кода — для гостя (внутри TelegramAutoLogin сам заведёт/залогинит).
export function tgAppDeepLink(): string {
  return TG_MINI_APP;
}

// Deep-link для привязки: открывает Mini App нашего бота с кодом в start_param.
export function tgLinkDeepLink(code: string): string {
  return TG_MINI_APP + '?startapp=' + encodeURIComponent(code);
}

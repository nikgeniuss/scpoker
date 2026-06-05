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
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  close: () => void;
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

import { useEffect, useState } from 'react';
import { getTelegramWebApp, isInTelegram, type TelegramWebApp } from '../lib/telegram';

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    // Реальный признак запуска внутри Telegram — непустой initData (см. lib/telegram).
    // Без этой проверки кнопка «Закрыть» появлялась в обычном браузере на всех страницах.
    if (!isInTelegram()) return;
    const tg = getTelegramWebApp();
    if (!tg) return;
    tg.ready();
    tg.expand();
    setWebApp(tg);
    setIsTelegram(true);
  }, []);

  return {
    webApp,
    isTelegram,
    user: webApp?.initDataUnsafe?.user ?? null,
    colorScheme: webApp?.colorScheme ?? 'dark',
  };
}

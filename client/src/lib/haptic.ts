// Тактильная отдача (вибрация). В Telegram Mini App — родной HapticFeedback,
// иначе — Web Vibration API (Android Chrome/PWA; iOS Safari молча игнорирует).
// Питает «Вибрацию» из настроек игры. Гейт по settings.vibrationEnabled — у вызывающего.

import { getTelegramWebApp } from './telegram';

export type HapticStyle = 'light' | 'medium' | 'heavy';

export function triggerHaptic(style: HapticStyle = 'medium'): void {
  // 1) Telegram Mini App — родной haptic
  const hf = getTelegramWebApp()?.HapticFeedback;
  if (hf?.impactOccurred) {
    try {
      hf.impactOccurred(style);
      return;
    } catch {
      // ignore — упадём на fallback
    }
  }
  // 2) Fallback — Web Vibration API
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    const ms = style === 'heavy' ? 30 : style === 'medium' ? 18 : 10;
    try {
      navigator.vibrate(ms);
    } catch {
      // ignore
    }
  }
}

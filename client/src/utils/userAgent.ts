// Дружелюбная подпись устройства для «Мои устройства» (§10.15) — без зависимости ua-parser-js,
// достаточно грубой ОС+браузер эвристики по регуляркам (§1: не тащить либу под одну строку текста).
export function summarizeUserAgent(ua: string): string {
  if (!ua) return 'Unknown';

  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    null;

  const browser =
    /Telegram/.test(ua) ? 'Telegram' :
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    null;

  if (browser && os) return `${browser} · ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.slice(0, 40);
}

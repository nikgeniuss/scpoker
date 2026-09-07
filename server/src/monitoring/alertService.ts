import { ALERT_TELEGRAM_CHAT_ID, TELEGRAM_BOT_TOKEN } from '../config.js';

// Алерты о падении процесса и ошибках записи данных (ROADMAP §11.3). До этого модуля единственным
// каналом были `console.log` на машине: процесс мог умереть ночью, и узнать об этом было неоткуда.
// Канал — уже работающий TG-бот (новых сервисов и зависимостей не заводим); не задан
// ALERT_TELEGRAM_CHAT_ID — функция просто выключена, сервер стартует как раньше.

// Одинаковые алерты не чаще раза в это окно: при циклическом падении (крэш → рестарт → крэш)
// иначе получим сотни одинаковых сообщений и упрёмся в лимиты Telegram.
const DEDUP_WINDOW_MS = 10 * 60_000;
// Отправка алерта не должна подвешивать выход процесса, если Telegram недоступен.
const SEND_TIMEOUT_MS = 5_000;

export type AlertKind = 'crash' | 'storage' | 'startup' | 'backup';

// === Чистая часть ===

// Слать ли алерт с этим ключом сейчас. lastSentAt — когда такой же слали в прошлый раз (или undefined).
export function shouldSend(lastSentAt: number | undefined, now: number, windowMs = DEDUP_WINDOW_MS): boolean {
  return lastSentAt === undefined || now - lastSentAt >= windowMs;
}

// Текст сообщения. Ошибку разворачиваем в message + первые строки стека — по одному тексту должно
// быть понятно, куда смотреть, без захода на машину.
export function formatAlert(kind: AlertKind, text: string, err?: unknown): string {
  const icon = kind === 'crash' ? '💥' : kind === 'storage' ? '💾' : kind === 'backup' ? '☁️' : '🟢';
  const head = `${icon} POKER HUB [${kind}] ${new Date().toISOString()}`;
  if (err === undefined) return `${head}\n${text}`;
  const detail =
    err instanceof Error
      ? [err.message, ...(err.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim())].join('\n')
      : String(err);
  return `${head}\n${text}\n${detail}`;
}

// === Отправка ===

const lastSent = new Map<string, number>();

export function isAlertingEnabled(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && ALERT_TELEGRAM_CHAT_ID);
}

// Best-effort: сбой отправки НИКОГДА не должен ломать вызывающий код (мы уже в обработчике аварии).
// Await'ить не обязательно — но при падении процесса стоит, чтобы успеть отправить до выхода.
export async function sendAlert(kind: AlertKind, text: string, err?: unknown): Promise<void> {
  if (!isAlertingEnabled()) return;
  const key = kind + ':' + text;
  const now = Date.now();
  if (!shouldSend(lastSent.get(key), now)) return;
  lastSent.set(key, now);

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ALERT_TELEGRAM_CHAT_ID, text: formatAlert(kind, text, err) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (sendErr) {
    console.error('⚠️ [alerts] не удалось отправить алерт:', sendErr);
  }
}

// Обработчики аварий процесса. Поведение при падении НЕ меняем: как и раньше, процесс умирает
// (его поднимает nodemon/менеджер процессов) — мы лишь успеваем сообщить об этом до выхода.
export function installCrashAlerts(): void {
  process.on('uncaughtException', (err) => {
    console.error('💥 uncaughtException:', err);
    void sendAlert('crash', 'Необработанное исключение — процесс завершается', err).finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('💥 unhandledRejection:', reason);
    void sendAlert('crash', 'Необработанный rejection — процесс завершается', reason).finally(() => process.exit(1));
  });
}

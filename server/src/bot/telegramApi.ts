import { TELEGRAM_BOT_TOKEN } from '../config.js';

// Тонкая обёртка над Telegram Bot API через нативный fetch — без новой зависимости (node-telegram-bot-api/telegraf).

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

// Ошибка Telegram API с машиночитаемыми полями. Раньше склеивалась в строку, и `retry_after`
// (сколько секунд Telegram просит подождать при 429) терялся — бот ждал своё фиксированное
// время и мог долбить раньше срока, получая более длинный бан.
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    readonly description: string | undefined,
    readonly retryAfterSec: number | undefined,
  ) {
    super(`Telegram API ${method} failed: ${description ?? errorCode ?? 'unknown'}`);
    this.name = 'TelegramApiError';
  }
}

async function callApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as TelegramApiResponse<T>;
  if (!json.ok) {
    throw new TelegramApiError(method, json.error_code ?? res.status, json.description, json.parameters?.retry_after);
  }
  return json.result as T;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id: number };
  };
}

// Сбрасываем вебхук перед запуском long polling — getUpdates конфликтует с активным вебхуком (409).
export function deleteWebhook(): Promise<boolean> {
  return callApi<boolean>('deleteWebhook', {});
}

export function getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]> {
  return callApi<TelegramUpdate[]>('getUpdates', {
    offset,
    timeout: timeoutSec,
    allowed_updates: ['message', 'callback_query'],
  });
}

export function sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<unknown> {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

// Заменяет текст и клавиатуру в уже отправленном сообщении — навигация по меню без накопления сообщений в чате.
export function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<unknown> {
  return callApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

// Гасит "часики" на нажатой кнопке у клиента. Без вызова Telegram сам снимет их по таймауту, но с задержкой.
export function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

import { readJSON } from '../auth/storage.js';
import type { User } from '../auth/auth.js';
import {
  deleteWebhook,
  getUpdates,
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  type TelegramUpdate,
} from './telegramApi.js';
import {
  mainMenuText,
  mainMenuKeyboard,
  profileText,
  profileKeyboard,
  helpText,
  helpKeyboard,
  languageText,
  languageKeyboard,
} from './menus.js';
import { getLanguage, setLanguage, type BotLanguage } from './botPrefs.js';

function findUserByTelegramId(telegramId: number): User | null {
  try {
    const users = readJSON('users.json') as User[];
    return users.find((u) => u.telegramId === telegramId) ?? null;
  } catch {
    return null;
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message?.text) {
    const lang = getLanguage(update.message.from?.id ?? update.message.chat.id);
    await sendMessage(update.message.chat.id, mainMenuText(lang), mainMenuKeyboard(lang));
    return;
  }

  const cb = update.callback_query;
  if (!cb?.message) return;
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const telegramId = cb.from.id;
  const lang = getLanguage(telegramId);

  await answerCallbackQuery(cb.id);

  switch (cb.data) {
    case 'profile': {
      const user = findUserByTelegramId(telegramId);
      await editMessageText(chatId, messageId, profileText(lang, user), profileKeyboard(lang));
      break;
    }
    case 'help':
      await editMessageText(chatId, messageId, helpText(lang), helpKeyboard(lang));
      break;
    case 'lang':
      await editMessageText(chatId, messageId, languageText(lang), languageKeyboard(lang));
      break;
    case 'lang_ru':
    case 'lang_en': {
      const newLang: BotLanguage = cb.data === 'lang_ru' ? 'ru' : 'en';
      setLanguage(telegramId, newLang);
      await editMessageText(chatId, messageId, mainMenuText(newLang), mainMenuKeyboard(newLang));
      break;
    }
    case 'back':
    default:
      await editMessageText(chatId, messageId, mainMenuText(lang), mainMenuKeyboard(lang));
      break;
  }
}

let running = false;

// Long polling — без публичного HTTPS-домена (вебхук недоступен, см. postmortems 2026-Q2).
export async function startBot(): Promise<void> {
  if (running) return;
  running = true;

  try {
    await deleteWebhook();
  } catch (err) {
    console.error('TG bot: deleteWebhook failed', err);
  }

  console.log('TG bot: long polling запущен');
  let offset = 0;

  while (running) {
    let updates: TelegramUpdate[];
    try {
      updates = await getUpdates(offset, 30);
    } catch (err) {
      console.error('TG bot: getUpdates failed', err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleUpdate(update);
      } catch (err) {
        console.error('TG bot: handleUpdate failed', err);
      }
    }
  }
}

import { readJSON, writeJSON } from '../auth/storage.js';

export type BotLanguage = 'ru' | 'en';

interface BotPrefsFile {
  [telegramId: string]: { language?: BotLanguage };
}

const FILE = 'bot-prefs.json';

function readPrefs(): BotPrefsFile {
  try {
    return readJSON(FILE) as BotPrefsFile;
  } catch {
    return {};
  }
}

export function getLanguage(telegramId: number): BotLanguage {
  const prefs = readPrefs();
  return prefs[telegramId]?.language ?? 'ru';
}

export function setLanguage(telegramId: number, language: BotLanguage): void {
  const prefs = readPrefs();
  prefs[telegramId] = { ...prefs[telegramId], language };
  writeJSON(FILE, prefs);
}

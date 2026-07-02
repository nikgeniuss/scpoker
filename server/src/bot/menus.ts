import type { InlineKeyboard } from './telegramApi.js';
import type { User } from '../auth/auth.js';
import type { BotLanguage } from './botPrefs.js';

// Бот/мини-апп зафиксированы для этого деплоя (см. client/src/lib/telegram.ts: TG_MINI_APP).
const TG_MINI_APP_URL = 'https://t.me/pokerhubcity_bot/play';

interface Strings {
  mainMenuText: string;
  play: string;
  profile: string;
  help: string;
  back: string;
  profileNoUser: string;
  profileName: string;
  profileChips: string;
  helpText: string;
  chooseLanguage: string;
}

const STRINGS: Record<BotLanguage, Strings> = {
  ru: {
    mainMenuText: '🃏 Покер Хаб\nДобро пожаловать!',
    play: '🎮 Играть',
    profile: '👤 Профиль',
    help: 'ℹ️ Помощь',
    back: '⬅️ Назад',
    profileNoUser: '👤 Профиль\n\nАккаунт не найден. Откройте «Играть», чтобы создать его.',
    profileName: 'Имя',
    profileChips: 'Фишки',
    helpText: 'ℹ️ Помощь\n\nДля игры нажмите «🎮 Играть» — откроется приложение Покер Хаб прямо в Telegram.',
    chooseLanguage: '🌐 Выберите язык:',
  },
  en: {
    mainMenuText: '🃏 Poker Hub\nWelcome!',
    play: '🎮 Play',
    profile: '👤 Profile',
    help: 'ℹ️ Help',
    back: '⬅️ Back',
    profileNoUser: '👤 Profile\n\nAccount not found yet. Open «Play» to create one.',
    profileName: 'Name',
    profileChips: 'Chips',
    helpText: 'ℹ️ Help\n\nTap «🎮 Play» to open the Poker Hub app right inside Telegram.',
    chooseLanguage: '🌐 Choose language:',
  },
};

function backKeyboard(lang: BotLanguage): InlineKeyboard {
  return [[{ text: STRINGS[lang].back, callback_data: 'back' }]];
}

export function mainMenuText(lang: BotLanguage): string {
  return STRINGS[lang].mainMenuText;
}

export function mainMenuKeyboard(lang: BotLanguage): InlineKeyboard {
  const s = STRINGS[lang];
  return [
    [{ text: s.play, url: TG_MINI_APP_URL }],
    [{ text: s.profile, callback_data: 'profile' }, { text: s.help, callback_data: 'help' }],
    // Подпись кнопки всегда на английском — не зависит от текущего языка (чтобы было видно, куда жать, до выбора языка).
    [{ text: '🌐 Language', callback_data: 'lang' }],
  ];
}

export function profileText(lang: BotLanguage, user: User | null): string {
  const s = STRINGS[lang];
  if (!user) return s.profileNoUser;
  return `${s.profile}\n\n${s.profileName}: ${user.displayName ?? user.username}\n${s.profileChips}: ${user.chips}`;
}

export function profileKeyboard(lang: BotLanguage): InlineKeyboard {
  return backKeyboard(lang);
}

export function helpText(lang: BotLanguage): string {
  return STRINGS[lang].helpText;
}

export function helpKeyboard(lang: BotLanguage): InlineKeyboard {
  return backKeyboard(lang);
}

export function languageText(lang: BotLanguage): string {
  return STRINGS[lang].chooseLanguage;
}

export function languageKeyboard(lang: BotLanguage): InlineKeyboard {
  return [
    [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }, { text: '🇬🇧 English', callback_data: 'lang_en' }],
    ...backKeyboard(lang),
  ];
}

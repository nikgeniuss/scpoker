import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './locales/ru';
import { en } from './locales/en';

const STORAGE_KEY = 'sk:lang';

export type Lang = 'ru' | 'en';

export function loadLang(): Lang {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'en' ? 'en' : 'ru';
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: loadLang(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;

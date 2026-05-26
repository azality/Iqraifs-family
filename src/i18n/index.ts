// i18n initializer.
// Reads saved language from localStorage (`fgs_lang`), falls back to `'en'`.
// Sets `<html dir>` based on language so Urdu renders right-to-left.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ur from './ur.json';

const STORAGE_KEY = 'fgs_lang';

export type Lang = 'en' | 'ur';

export function getCurrentLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

export function setCurrentLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore quota / private-mode errors */
  }
  void i18n.changeLanguage(lang);
  applyDir(lang);
}

export function applyDir(lang: Lang): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ur: { translation: ur },
  },
  lng: getCurrentLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDir(getCurrentLang());

export default i18n;

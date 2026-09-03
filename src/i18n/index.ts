// i18n initializer.
// Reads saved language from localStorage (`fgs_lang`), falls back to `'en'`.
// Sets `<html dir>` based on language so Urdu renders right-to-left.
//
// TRANSLATION SCOPE (pilot decision, July 2026; amended Sep 2026): the
// STAFF UI (src/app/pages/school/*) ships English-only for the pilot —
// with ONE exception: the hifz teaching flow (`hifzTeach.*` keys —
// dashboard banner, roster, log dialog), translated Sep 2026 because
// hifz teachers are the staff most comfortable in Urdu (Muneeb, after
// a hifz teacher switched to اردو and hit an English wall). Everything
// PARENT- or STUDENT-facing (src/app/pages/portal/*) must go through
// t() with en + ur entries. Full staff translation stays post-pilot.

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

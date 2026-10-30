import ar from '../i18n/ar.js';
import en from '../i18n/en.js';

const translations = { ar, en };
const STORAGE_KEY = 'rasan.lang';
const listeners = new Set();

export function getInitialLang() {
  const urlParams = new URLSearchParams(window.location.search);
  const langParam = urlParams.get('lang');
  if (langParam === 'ar' || langParam === 'en') {
    return langParam;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ar' || stored === 'en') {
    return stored;
  }
  return 'ar';
}

let currentLang = getInitialLang();

export function getCurrentLang() {
  return currentLang;
}

export function setLanguage(lang) {
  if (lang !== 'ar' && lang !== 'en') return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    console.warn('localStorage not accessible for lang preference', e);
  }

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Dispatch change to subscribers
  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch (err) {
      console.error('Error in language listener:', err);
    }
  });
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key) {
  const dict = translations[currentLang] || translations.ar;
  return dict[key] || translations.ar[key] || key;
}

export function initI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

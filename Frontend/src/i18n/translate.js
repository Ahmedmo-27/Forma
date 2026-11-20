import AR from './ar.js';

export const LANGUAGES = ['en', 'ar'];
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'forma.lang';
export const LANGUAGE_LABELS = { en: 'English', ar: 'العربية' };

const DICTIONARIES = { ar: AR };

export function normalizeLanguage(value) {
  const base = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.includes(base) ? base : null;
}

export function dirFor(lang) {
  return normalizeLanguage(lang) === 'ar' ? 'rtl' : 'ltr';
}

/** A user's explicit choice wins, then the gym default, then English. */
export function resolveLanguage({ stored, tenantDefault } = {}) {
  return normalizeLanguage(stored) || normalizeLanguage(tenantDefault) || DEFAULT_LANGUAGE;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name])));
}

/**
 * Keys are the English source strings, so untranslated text falls back to
 * readable English and call sites stay greppable.
 */
export function translate(lang, key, vars) {
  const dict = DICTIONARIES[normalizeLanguage(lang)];
  const text = (dict && dict[key]) || key;
  return interpolate(String(text), vars);
}

/**
 * The language of the running app, for code that lives outside React (API
 * error normalizing, error catalog). `LanguageProvider` keeps it in sync.
 */
let activeLanguage = readStoredLanguage() || DEFAULT_LANGUAGE;

export function setActiveLanguage(lang) {
  activeLanguage = normalizeLanguage(lang) || DEFAULT_LANGUAGE;
}

export function getActiveLanguage() {
  return activeLanguage;
}

/** `translate()` in the active language, for non-React code. */
export function tActive(key, vars) {
  return translate(activeLanguage, key, vars);
}

/**
 * Marks an English string as translatable without translating it yet. Use it
 * for labels declared at module level (tables, option lists, status maps),
 * then call `t(label)` where it renders:
 *
 *   const STATUS = { paid: tr('Paid') };   // module scope
 *   <span>{t(STATUS[row.status])}</span>   // render time
 *
 * The i18n audit treats `tr('...')` and `t('...')` literals as dictionary keys.
 */
export function tr(text) {
  return text;
}

export function readStoredLanguage() {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeLanguage(lang) {
  try {
    if (lang) window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    else window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // Private mode: the choice lasts for this tab only.
  }
}

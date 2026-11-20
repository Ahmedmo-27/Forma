import { createContext, useContext } from 'react';
import { DEFAULT_LANGUAGE, dirFor, translate } from './translate.js';

export const I18nContext = createContext(null);

const FALLBACK = {
  lang: DEFAULT_LANGUAGE,
  dir: dirFor(DEFAULT_LANGUAGE),
  isRtl: false,
  t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
  setLanguage: () => {},
  userChoice: null,
};

/** Outside a LanguageProvider (platform console, tests) this returns English. */
export function useI18n() {
  return useContext(I18nContext) || FALLBACK;
}

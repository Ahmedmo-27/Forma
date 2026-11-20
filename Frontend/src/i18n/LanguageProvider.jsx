import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { I18nContext } from './useI18n.js';
import {
  dirFor,
  readStoredLanguage,
  resolveLanguage,
  setActiveLanguage,
  storeLanguage,
  translate,
} from './translate.js';

export default function LanguageProvider({ children }) {
  const { tenant } = useTenant();
  const [userChoice, setUserChoice] = useState(readStoredLanguage);
  const lang = resolveLanguage({ stored: userChoice, tenantDefault: tenant?.settings?.locale?.language });
  const dir = dirFor(lang);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { lang: root.getAttribute('lang'), dir: root.getAttribute('dir') };
    root.setAttribute('lang', lang);
    root.setAttribute('dir', dir);
    setActiveLanguage(lang);
    return () => {
      root.setAttribute('lang', previous.lang || 'en');
      if (previous.dir) root.setAttribute('dir', previous.dir);
      else root.removeAttribute('dir');
    };
  }, [lang, dir]);

  const setLanguage = useCallback((next) => {
    storeLanguage(next);
    setUserChoice(next || null);
  }, []);

  const value = useMemo(() => ({
    lang,
    dir,
    isRtl: dir === 'rtl',
    userChoice,
    setLanguage,
    t: (key, vars) => translate(lang, key, vars),
  }), [lang, dir, userChoice, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

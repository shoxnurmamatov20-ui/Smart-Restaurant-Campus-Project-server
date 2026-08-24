import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { KEYS, read, write } from './storage';

/**
 * Which of the three languages this phone reads.
 *
 * The web build resolves it from `?lang=`, a cookie, and `Accept-Language`, in
 * that order. A phone has the first two folded into one — what the person chose
 * in the app — and the third is the device language. Uzbek when nothing spoke,
 * for the same reason `middleware.ts` gives: the platform is Uzbek-first and
 * the venues are in Tashkent.
 *
 * The choice is remembered in secure storage beside the session rather than in
 * a separate store, so a phone has one place its settings live.
 */
export type Lang = 'uz' | 'ru' | 'en';

const SUPPORTED: readonly Lang[] = ['uz', 'ru', 'en'];

const isLang = (value: unknown): value is Lang =>
  typeof value === 'string' && (SUPPORTED as readonly string[]).includes(value);

function fromDevice(): Lang {
  const tag = getLocales()[0]?.languageCode;

  return isLang(tag) ? tag : 'uz';
}

const LocaleContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: 'uz',
  setLang: () => undefined,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(fromDevice);

  useEffect(() => {
    let live = true;

    // A stored choice beats the device — it is what the person tapped.
    read(KEYS.locale).then((stored) => {
      if (live && isLang(stored)) setLangState(stored);
    });

    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        setLangState(next);
        void write(KEYS.locale, next);
      },
    }),
    [lang],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

import uz from '../messages/uz.json';
import ru from '../messages/ru.json';
import en from '../messages/en.json';

export type Locale = 'uz' | 'ru' | 'en';

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['uz', 'ru', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'uz';
export const FALLBACK_LOCALE: Locale = 'en';

export const messages = { uz, ru, en } as const;

export const localeLabels: Record<Locale, string> = {
  uz: "O'zbekcha",
  ru: 'Русский',
  en: 'English',
};

export type Messages = typeof uz;

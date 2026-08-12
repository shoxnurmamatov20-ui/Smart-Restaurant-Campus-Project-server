import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  localeLabels,
  messages as shared,
  SUPPORTED_LOCALES,
  type Locale,
} from '@restaurant/i18n';

import { en } from './en';
import { ru } from './ru';
import { uz, type AdminMessages } from './uz';

export { DEFAULT_LOCALE, FALLBACK_LOCALE, localeLabels, SUPPORTED_LOCALES };
export type { AdminMessages, Locale };

/**
 * The platform console's catalogues, one per language.
 *
 * Two layers, merged here. `packages/i18n` holds what every surface needs — the
 * button verbs, the module names, the error text — because the restaurant
 * console says the same things; ./uz.ts and its siblings hold what only this
 * console says.
 *
 * Merged at the top level rather than deeply: the two layers own different
 * namespaces (`common`, `modules`, `errors` against `platform`), so a spread is
 * enough and a deep merge would only hide a collision.
 */
export const messages = {
  uz: { ...shared.uz, ...uz },
  ru: { ...shared.ru, ...ru },
  en: { ...shared.en, ...en },
} as const;

/** What a component holds after `useMessages()`. */
export type Messages = (typeof messages)[Locale];

/** The three languages, ready for a picker. */
export const LANGUAGE_OPTIONS = SUPPORTED_LOCALES.map((code) => ({
  code,
  short: code.toUpperCase(),
  label: localeLabels[code],
}));

import { guestCopy, type GuestCopy } from '@restaurant/surfaces/guest/copy';
import type { GuestLocale } from '@restaurant/surfaces/guest/menu-data';

/**
 * Which language a guest reads in, and the words for it.
 *
 * Not `next-intl`. That reads the console's catalogue through a request context
 * a guest never establishes — there is no session, no user, no stored preference
 * — and it would ship the whole staff console's copy to a phone on a café's
 * Wi-Fi. The guest catalogue is its own file, resolved by a plain lookup.
 *
 * The order is deliberate: an explicit choice beats the browser, because a guest
 * who taps "RU" has said something the `Accept-Language` header cannot override.
 * The restaurant's own default comes last and only when nothing else spoke.
 */
export function guestLocale(chosen?: string, acceptLanguage?: string | null): GuestLocale {
  if (chosen === 'uz' || chosen === 'ru' || chosen === 'en') return chosen;

  const first = (acceptLanguage ?? '').split(',')[0]?.slice(0, 2).toLowerCase();

  if (first === 'ru' || first === 'en' || first === 'uz') return first;

  // Uzbek, because the restaurant is in Uzbekistan and a guest who expressed no
  // preference is far more likely to read it than English.
  return 'uz';
}

export function copyFor(locale: GuestLocale): GuestCopy {
  return guestCopy[locale];
}

/**
 * Fill the `{placeholders}` a catalogue line carries.
 *
 * The catalogue is written with them — `'{count} taom'` — because a sentence
 * with a number in the middle cannot be assembled by concatenation in three
 * languages: Russian puts the count before a genitive plural, Uzbek after a
 * bare noun, English before a plural. One template per language, filled here.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce<string>(
    (line, [key, value]) => line.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/**
 * The currency word, which is not copy.
 *
 * `so'm` is the same string in Uzbek and English and differs only in Russian, so
 * it fails the catalogue's own rule — `i18n.test.ts` rejects a key whose three
 * values match, on the grounds that it is data wearing copy's clothes. It lives
 * here beside the formatter that always pairs with it.
 */
const CURRENCY: Record<GuestLocale, string> = { uz: "so'm", ru: 'сум', en: "so'm" };

/**
 * Money, as a guest reads it — amount and unit together.
 *
 * Together on purpose: every call site needs both, and splitting them is how a
 * price ends up rendered without its currency on one screen out of six. Tiyin in,
 * so'm out, grouped with spaces — `45 240 so'm` rather than `45,240`, which reads
 * as a decimal here.
 *
 * The fraction is dropped because a menu price is always whole so'm, and a
 * trailing `,00` on every line of a phone-width list is noise that pushes the
 * dish name into a second row.
 */
export function som(tiyin: number, locale: GuestLocale): string {
  const { amount, currency } = somParts(tiyin, locale);

  return `${amount} ${currency}`;
}

/**
 * The same money, in two pieces.
 *
 * For the handful of catalogue lines that place the figure and the unit
 * separately — `'{amount} {currency} · {method}'` on the receipt line — where a
 * pre-joined string would put the currency word in the wrong half of the
 * sentence. `som()` is built on this rather than beside it, so the grouping
 * rule has one implementation and the two can never disagree.
 */
export function somParts(tiyin: number, locale: GuestLocale): { amount: string; currency: string } {
  const whole = Math.round(tiyin / 100);

  return {
    /*
     * A narrow no-break space between the groups — U+202F.
     *
     * FOUNDATIONS §CONTENT RULES: "UZS with thin-space separators
     * (18 420 000)". `toLocaleString` gives a comma in English and a
     * full-width no-break space in Russian, so a price read "150,000" in one
     * language and "150 000" in the next on the same menu.
     *
     * Narrow *no-break*, not the plain thin space U+2009: the rule asks for a
     * thin separator and this is one, but it also keeps the number whole. A
     * breakable separator lets a phone wrap "150" onto one line and "000" onto
     * the next, which reads as a hundred and fifty so'm.
     */
    amount: whole
      .toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')
      .replace(/[,\s\u00a0]/g, '\u202f'),
    currency: CURRENCY[locale],
  };
}

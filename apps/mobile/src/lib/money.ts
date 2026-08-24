import type { Lang } from './locale';

/**
 * A price, in the words the reader uses.
 *
 * Tiyin in, a grouped so'm figure out. The arithmetic itself is
 * `@restaurant/surfaces/money` — this is only the formatting, which differs by
 * platform: the web build reaches for `Intl.NumberFormat` through
 * `@restaurant/utils`, and Hermes ships a full ICU only when the build asks for
 * it. Grouping by hand costs four lines and works on every device.
 *
 * A narrow no-break space between groups, which is what the design draws:
 * `48 000` never breaks across a line, so a price is never read as two numbers.
 */
const WORD: Readonly<Record<Lang, string>> = { uz: "so'm", ru: 'сум', en: "so'm" };

const grouped = (whole: number): string => String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * A whole number, grouped the way a price is — `2480` → `2 480`.
 *
 * For the figures that are counted rather than paid: loyalty points, an order
 * count. They must not go through `som()`, which divides by a hundred and adds a
 * currency word — a guest who reads 2 480 points as so'm is wrong about their
 * balance by two orders of magnitude. Same grouping, so the two read as one
 * typographic system.
 */
export const groupDigits = (whole: number): string => grouped(Math.round(whole));

/** `4_800_000` → `48 000 so'm`. */
export function som(tiyin: number, lang: Lang, withWord = true): string {
  const negative = tiyin < 0;
  const figure = grouped(Math.round(Math.abs(tiyin) / 100));

  return `${negative ? '−' : ''}${figure}${withWord ? ` ${WORD[lang]}` : ''}`;
}

/** The same, signed — a refund reads as a refund. */
export const signedSom = (tiyin: number, lang: Lang): string =>
  `${tiyin > 0 ? '+' : ''}${som(tiyin, lang)}`;

/**
 * The currency word on its own.
 *
 * For the handful of catalogue lines that place the figure and the unit
 * separately — `'{amount} {currency} · {method}'` on the guest receipt — where a
 * pre-joined string would put the word in the wrong half of the sentence. It
 * reads the same table `som()` does, so the two can never disagree.
 */
export const somWord = (lang: Lang): string => WORD[lang];

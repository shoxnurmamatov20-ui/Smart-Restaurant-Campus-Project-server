import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes intelligently.
 * Usage: cn('p-4', isLarge && 'p-8', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * How each language groups a figure and marks its decimal.
 *
 * Uzbek and Russian both group with a space; the space is non-breaking so a
 * price can never wrap between its thousands. English groups with a comma.
 */
const CONVENTIONS = {
  uz: { group: ' ', decimal: ',' },
  ru: { group: ' ', decimal: ',' },
  en: { group: ',', decimal: '.' },
} as const;

/**
 * Format a number the way the reader's language writes one.
 *
 * The separators are ours rather than ICU's, and that is the whole point.
 * `Intl.NumberFormat('uz-UZ')` does not agree with itself across environments:
 * Node groups 2 400 000 with spaces, Chrome renders the same call as
 * "2,400,000". On a server-rendered page that is a hydration mismatch, and on
 * any page it is a figure that changes shape depending on where it was built —
 * which for money is not a cosmetic problem.
 *
 * So the grouping is computed in `en-US`, whose parts every ICU build agrees
 * on, and the separators are substituted from the table above.
 */
export function formatNumber(value: number, locale: 'uz' | 'ru' | 'en' = 'uz'): string {
  const { group, decimal } = CONVENTIONS[locale];

  return new Intl.NumberFormat('en-US')
    .formatToParts(value)
    .map((part) => {
      if (part.type === 'group') return group;
      if (part.type === 'decimal') return decimal;
      return part.value;
    })
    .join('');
}

/**
 * Format an amount the API returned, which is always integer **tiyin**.
 *
 * Every price, total and takings figure crosses the wire in tiyin
 * (1 UZS = 100 tiyin) so no rounding can happen in transit. Passing one of
 * those straight to `formatCurrency` prints a hundredfold price — 45 000 so'm
 * becomes 4 500 000 — which is exactly the kind of bug a guest notices before
 * anyone else does. Use this for anything that came from the backend.
 */
export function formatTiyin(
  tiyin: number,
  currency: 'UZS' | 'USD' | 'EUR' | 'RUB' = 'UZS',
  locale: 'uz' | 'ru' | 'en' = 'uz',
): string {
  return formatCurrency(wholeSom(tiyin), currency, locale);
}

/**
 * Tiyin to so'm, whole.
 *
 * No tiyin coin has circulated for years, no receipt prints one, and no
 * price on any menu here carries one. The only way a fraction reaches a
 * screen is a derived figure — an average cheque of 9 093 333 tiyin — and
 * "90 933,33 so'm" on a dashboard reads as a bug, not as precision. The API
 * keeps integer tiyin end to end so nothing is lost in transit; this is where
 * the number is read, and a reader wants so'm.
 */
function wholeSom(tiyin: number): number {
  return Math.round(tiyin / 100);
}

/**
 * The same amount, grouped but with no currency attached.
 *
 * The design sets money as a number with `so'm` beside it as a separate muted
 * token, at a different size and weight — which a single formatted currency
 * string cannot express. This returns just the figure so the unit can be its
 * own element.
 *
 * It exists so no caller reaches for `tiyin / 100` inline. That division is
 * the whole reason {@link formatTiyin} exists, and a component doing it by
 * hand is how a hundredfold price gets onto a screen.
 */
export function formatTiyinAmount(tiyin: number, locale: 'uz' | 'ru' | 'en' = 'uz'): string {
  return formatNumber(wholeSom(tiyin), locale);
}

/**
 * How each language shortens a million.
 *
 * English attaches it — 18.4M — and the other two take a space, because `mln`
 * and `млн` are abbreviated words rather than symbols. The design writes both
 * forms in exactly this way.
 */
const MILLIONS = { uz: ' mln', ru: ' млн', en: 'M' } as const;

/**
 * The same amount, short enough for a tile.
 *
 * The POS idle screen gives today's takings a 112px box beside three
 * two-digit counts; "18 420 000" does not fit and shrinking the type to make
 * it fit would make the one figure that matters the hardest to read. The
 * design shortens it — `(n / 1e6).toFixed(1) + "M"` — and this is that rule,
 * with the word in the reader's language.
 *
 * Below a million it prints in full, which the design's own rule does not do
 * and should: `0.2M` at eleven in the morning is both uglier and less useful
 * than `240 000`, and a quiet start to the day is exactly when somebody is
 * watching this number.
 *
 * Takes tiyin, like every other formatter here, so no caller divides by 100
 * on the way in.
 */
export function formatTiyinCompact(tiyin: number, locale: 'uz' | 'ru' | 'en' = 'uz'): string {
  const som = tiyin / 100;

  if (Math.abs(som) < 1_000_000) {
    return formatNumber(Math.round(som), locale);
  }

  // One decimal, and the separator the language uses for one — 18,4 млн in
  // Russian is as wrong with a full stop as 18.4 mln is with a comma.
  return `${formatNumber(Math.round(som / 100_000) / 10, locale)}${MILLIONS[locale]}`;
}

/** What each currency is written as, and which side of the figure it sits on. */
const CURRENCIES = {
  UZS: { symbol: "so'm", leading: false },
  USD: { symbol: '$', leading: true },
  EUR: { symbol: '€', leading: true },
  RUB: { symbol: '₽', leading: false },
} as const;

/**
 * Format currency from a whole-unit amount (so'm, not tiyin).
 *
 * Built on {@link formatNumber} for the same reason it exists: ICU's currency
 * formatting varies by environment — symbol, placement and spacing all move —
 * and a total that reads differently on the server than in the browser is a
 * total nobody can reconcile. The symbols here are the ones the design uses.
 *
 * For values that came from the API, use {@link formatTiyin} instead.
 */
export function formatCurrency(
  value: number,
  currency: 'UZS' | 'USD' | 'EUR' | 'RUB' = 'UZS',
  locale: 'uz' | 'ru' | 'en' = 'uz',
): string {
  const { symbol, leading } = CURRENCIES[currency];
  const figure = formatNumber(value, locale);

  return leading ? `${symbol}${figure}` : `${figure} ${symbol}`;
}

/**
 * Truncate string to N chars with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Sleep helper (for tests/demos).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type-safe Object.entries.
 */
export function entries<T extends Record<string, unknown>>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Type-safe Object.keys.
 */
export function keys<T extends Record<string, unknown>>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

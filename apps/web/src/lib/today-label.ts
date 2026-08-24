/**
 * The eyebrow date over a greeting: "Seshanba, 11-avgust".
 *
 * The design's mock carried that exact string, and so did the catalogue —
 * which is how the live dashboard greeted every reader with the eleventh of
 * August for as long as it was live. The date is not copy; it is the day.
 *
 * `Intl` does the language and the month names. What it does not do is the
 * capital: Uzbek and Russian write weekdays in lower case mid-sentence, and
 * `Intl` follows the rule, but an eyebrow is a heading and the design sets it
 * with a capital. British English is what reads "11 August" rather than
 * "August 11" — the order the other two languages use, and the one a reader
 * here expects.
 */
const INTL_LOCALE: Readonly<Record<string, string>> = { uz: 'uz', ru: 'ru', en: 'en-GB' };

export function todayLabel(locale: string, now: Date): string {
  const text = new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  // "Tuesday 11 August" — the British form drops the comma; the design keeps it.
  const punctuated = locale === 'en' ? text.replace(/^(\p{L}+) /u, '$1, ') : text;

  return (
    punctuated.charAt(0).toLocaleUpperCase(INTL_LOCALE[locale] ?? locale) + punctuated.slice(1)
  );
}

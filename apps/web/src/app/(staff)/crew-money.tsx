import { CURRENCY_WORD, MILLION_WORD, say, type Lang } from '@restaurant/surfaces/crew/data';

/**
 * Group a whole so'm figure the way this market reads one.
 *
 * Spaces, never commas. A comma is the decimal separator in Uzbek and Russian
 * typography, so `284,000` reads as two hundred and eighty-four so'm on two of
 * the three screens this app ships in — and on a bill that is the difference
 * between a rounding note and an argument at the table.
 */
function group(whole: number, lang: Lang): string {
  return whole.toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU').replace(/[, \s]/g, ' ');
}

/**
 * A figure of money, set the way the design sets one.
 *
 * The number and the unit are two elements at two sizes, not one formatted
 * string: the design puts the figure at reading weight with the currency word
 * muted and smaller beside it, which `Intl.NumberFormat({ style: 'currency' })`
 * cannot express — it returns a single run of text.
 *
 * Tiyin in. The platform stores money as an integer in tiyin (1 so'm = 100
 * tiyin) so no rounding error can reach a bill, and the division to so'm happens
 * here, once, at the last possible moment before a person reads it.
 */
export function Som({
  tiyin,
  lang,
  className = '',
  unit = true,
}: {
  tiyin: number;
  lang: Lang;
  className?: string;
  /** Off inside a table cell, where the column header already says so'm. */
  unit?: boolean;
}) {
  const figure = group(Math.round(tiyin / 100), lang);

  return (
    <span data-num className={className}>
      {figure}
      {unit ? (
        <span className="text-fg-subtle ml-1 text-xs font-normal">{say(CURRENCY_WORD, lang)}</span>
      ) : null}
    </span>
  );
}

/**
 * The same figure at the scale a day's revenue is actually discussed in.
 *
 * Nobody in a restaurant says eighteen million four hundred and twenty thousand;
 * they say eighteen point four. Two decimals, because one hides a hundred
 * thousand so'm of difference between two branches and the whole point of the
 * branch list is comparing them.
 */
export function Millions({
  tiyin,
  lang,
  className = '',
}: {
  tiyin: number;
  lang: Lang;
  className?: string;
}) {
  const value = (tiyin / 100 / 1_000_000).toFixed(2);

  return (
    <span data-num className={className}>
      {value}
      <span className="ml-1 text-xs font-normal opacity-70">{say(MILLION_WORD, lang)}</span>
    </span>
  );
}

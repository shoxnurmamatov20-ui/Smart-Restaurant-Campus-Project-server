import { CURRENCY_WORD, type Lang } from '@restaurant/surfaces/customer/data';

/**
 * A price, set the way the design sets one.
 *
 * The figure and the unit are two elements at two sizes, not one formatted
 * string: the design puts the number at the reading weight and the currency word
 * muted and smaller beside it, which `Intl.NumberFormat` with `style: 'currency'`
 * cannot express — it returns one run of text.
 *
 * Tiyin in. The whole platform stores money as an integer in tiyin (1 so'm = 100
 * tiyin) so no rounding error can ever reach a bill, and the division happens
 * here at the last possible moment, once, on its way to a screen.
 */
/**
 * The figure alone, grouped the way the design groups one.
 *
 * Grouped with spaces, not commas. A comma is a decimal separator in Uzbek and
 * Russian typography, so `45,240` reads as forty-five so'm on the two screens
 * out of three this app is most often opened on.
 */
export function somFigure(tiyin: number, lang: Lang): string {
  return Math.round(tiyin / 100)
    .toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')
    .replace(/[,\s]/g, ' ');
}

/**
 * Figure and unit as one string, for the places a sentence swallows a price.
 *
 * `<Money>` is the default because the design sets the two at two sizes; this
 * exists for the handful of lines where the price is inside prose — the home
 * screen's delivery note, a toast — and a nested element would break the
 * sentence into three.
 */
export function somText(tiyin: number, lang: Lang): string {
  return `${somFigure(tiyin, lang)} ${CURRENCY_WORD[lang]}`;
}

export function Money({
  tiyin,
  lang,
  className = '',
}: {
  tiyin: number;
  lang: Lang;
  className?: string;
}) {
  const figure = somFigure(tiyin, lang);

  return (
    <span data-num className={`text-sm font-semibold ${className}`}>
      {figure} <span className="text-fg-subtle text-xs font-normal">{CURRENCY_WORD[lang]}</span>
    </span>
  );
}

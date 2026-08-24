import type { Lede } from './overview-data';

/** What `t()` looks like to this file — `next-intl`'s, with ICU arguments. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

const AGAINST: Readonly<Record<Lede['period'], string>> = {
  today: 'againstToday',
  week: 'againstWeek',
  month: 'againstMonth',
};

/**
 * The line under the greeting, from facts.
 *
 * The design's sentence has two halves — a comparison and a count — and the
 * catalogue's `lede` key still carries it for the fixture console, which has
 * no facts to word. With facts, each half is worded on its own: the
 * comparison names the place and the period it is against, rounds to one
 * decimal and never says "ahead" of a delta the server marked unknown; the
 * count uses ICU plurals, because "ikkita masala" and "2 ta masala" are not
 * the same sentence in Uzbek, nor "два вопроса" and "пять вопросов" in
 * Russian.
 */
export function ledeText(lede: Lede | null, t: Translate): string {
  if (lede === null) return t('lede');

  const parts: string[] = [];
  const delta = lede.revenueDeltaPercent;

  if (delta !== null) {
    const against = t(AGAINST[lede.period]);
    const percent = Math.abs(Math.round(delta * 10) / 10);

    parts.push(
      percent === 0
        ? t('ledeLevel', { place: lede.branch, against })
        : t(delta > 0 ? 'ledeAhead' : 'ledeBehind', { place: lede.branch, against, percent }),
    );
  }

  parts.push(t('ledeIssues', { count: lede.issues }));

  return parts.join(' ');
}

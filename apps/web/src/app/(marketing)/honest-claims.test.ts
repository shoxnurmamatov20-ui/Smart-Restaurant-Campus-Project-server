import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAGE_CITIES } from './pages-data';
import { pagesCopy } from './pages-copy';
import { QUOTES, STATS } from './site-data';

/**
 * The public site may not claim customers this platform does not have.
 *
 * `/customers` presented three case studies with named owners, named
 * restaurants, launch dates and measured results, and the home page quoted the
 * same three people again. Every word of it was written as design copy for a
 * product with no customers yet, and on a live site it reads as what it looks
 * like: testimonials. That is a claim about the world, made to somebody
 * deciding whether to hand over their restaurant's takings.
 *
 * The cards were worth keeping — the situations in them are the ones the system
 * is built around — so what changed is the framing: modelled scenarios,
 * attributed to a role, with the modelling said out loud rather than in a
 * footnote. These tests are what stop the names coming back.
 *
 * Scoped to the marketing pages and the restaurant site, deliberately. The
 * console's demo fixtures carry invented names too — `Rustam Kamolov` signs a
 * demo document, `Malika Tosheva` waits a demo table — and that is correct:
 * they are sample data inside a product, behind a login, labelled as samples.
 * A marketing page is the one surface where an invented person is a lie.
 */
const INVENTED_PEOPLE = [
  'Rustam Kamolov',
  'Kamola Yusupova',
  'Shahzod Ergashev',
  'Рустам Камолов',
  'Камола Юсупова',
  'Шахзод Эргашев',
];

/**
 * And the restaurants they were supposed to run.
 *
 * A named business is the same claim as a named person: `Choyxona 24, Toshkent`
 * under a quote reads as a customer, and somebody can look for it. The
 * scenarios describe the restaurant instead — "a tea house, open 24 hours" —
 * which is what the reader actually needs to decide whether the scenario is
 * theirs.
 */
const INVENTED_VENUES = ['Choyxona 24', 'Osh Markazi'];

const LOCALES = ['uz', 'ru', 'en'] as const;

function sourcesIn(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sourcesIn(path));
    } else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      found.push(path);
    }
  }

  return found;
}

describe('the public site claims nothing it cannot support', () => {
  it('names no customer anywhere in the marketing or venue pages', () => {
    const guilty: string[] = [];

    for (const root of [__dirname, join(__dirname, '..', '(site)')]) {
      for (const file of sourcesIn(root)) {
        /*
         * Comments out first. The file that used to hold these names now holds
         * a note explaining why it does not, and a note is not a claim — but a
         * plain scan cannot tell the two apart, and a rule that forbids writing
         * down what went wrong is a rule that erases its own reason.
         */
        const source = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');

        for (const claim of [...INVENTED_PEOPLE, ...INVENTED_VENUES]) {
          if (source.includes(claim)) guilty.push(`${file.split('/').pop()}: ${claim}`);
        }
      }
    }

    expect(guilty).toEqual([]);
  });

  it('says the scenarios are modelled, in every language', () => {
    for (const locale of LOCALES) {
      const t = pagesCopy(locale);

      // The line above the three cards, and the lede on their own page. Both
      // have to carry it: a reader arriving from search lands on one or the
      // other, never reliably on both.
      expect(t.page.tNote.trim()).not.toBe('');
      expect(t.page.cusP.length).toBeGreaterThan(80);
    }
  });

  it('attributes each card to a role rather than to a person', () => {
    for (const locale of LOCALES) {
      const t = pagesCopy(locale);

      expect(t.quotes).toHaveLength(QUOTES.length);

      for (const quote of t.quotes) {
        expect(quote.role.trim()).not.toBe('');
        // A role, not "Firstname Lastname · role" — the shape the caption had.
        expect(/^\p{Lu}\p{Ll}+\s\p{Lu}\p{Ll}+\s·/u.test(quote.role)).toBe(false);
      }

      for (const study of t.cases) {
        expect(/^\p{Lu}\p{Ll}+\s\p{Lu}\p{Ll}+\s·/u.test(study.who)).toBe(false);
        // And no launch date: the deployment history was invented too.
        expect(/20\d\d/.test(study.period)).toBe(false);
      }
    }
  });

  it('prints figures about the product, not about its sales', () => {
    /*
     * The four under the hero were `42 restaurants running`, `118 connected
     * branches`, `99.98% uptime` and `142 ms` — two invented, two hard-coded
     * and presented as measurements. What stands there now is checkable from
     * the repository, and this test is the check: if somebody puts a customer
     * count back, the value stops matching the thing it counts.
     */
    const figures = Object.fromEntries(STATS.map((stat) => [stat.key, stat.value]));

    expect(figures.sections).toBe('24');
    expect(figures.modules).toBe('14');
    expect(figures.languages).toBe(String(LOCALES.length));
    expect(figures.modes).toBe('4');

    // No percentage and no millisecond claim: nothing on this site measures
    // either, and a number nobody measures is a number nobody can defend.
    for (const stat of STATS) {
      expect(/%|ms\b/.test(stat.value)).toBe(false);
    }
  });

  it('strips the city band of its invented restaurant counts', () => {
    // Five cities, no tally: `26 · 7 · 4 · 3 · 2` restaurants was a claim about
    // sales printed under a heading that called them customers.
    expect(PAGE_CITIES).toBe(5);

    for (const locale of LOCALES) {
      expect(pagesCopy(locale).cities).toHaveLength(PAGE_CITIES);
      expect(pagesCopy(locale).cusCities.trim()).not.toBe('');
    }
  });

  it('opens with what the product is, not with a customer count', () => {
    /*
     * The hero pill is the first line a reader sees and the line the shared
     * OpenGraph card repeats. It said "42 restoran, 118 filial ishlatmoqda" —
     * a customer count, in the position where a claim is least likely to be
     * questioned and most likely to be quoted.
     */
    for (const locale of LOCALES) {
      const t = pagesCopy(locale);

      expect(/\b42\b|\b118\b/.test(t.page.heroPill)).toBe(false);
      // And the ROI note may not justify its percentages with an average over
      // restaurants nobody has.
      expect(/\b42\b/.test(t.page.roiDisclaimer)).toBe(false);
    }
  });

  it('leaves no customer count in the message catalogue either', () => {
    /*
     * `src/i18n/*.ts` holds an older copy of the same marketing text — the
     * header's nav labels still come from it — and it kept every claim the
     * page had dropped: the hero pill, the four sales figures, the three
     * quotes with their people and venues, and a platform-console lede reading
     * "Qirq ikkita restoran, 118 filial" that nothing renders any more. Two
     * catalogues are two places for a claim to survive being removed.
     */
    const claims = [/\b42\b/, /\b118\b/, /Qirq ikkita/, /Сорок два/, /Forty-two/];

    for (const locale of LOCALES) {
      const source = readFileSync(join(__dirname, '..', '..', 'i18n', `${locale}.ts`), 'utf8');
      const marketing = source.slice(source.indexOf('marketing:'), source.indexOf('console:'));

      for (const claim of claims) expect(claim.test(marketing)).toBe(false);
      for (const person of [...INVENTED_PEOPLE, ...INVENTED_VENUES]) {
        expect(marketing.includes(person)).toBe(false);
      }
    }
  });

  it('keeps the three cards rather than deleting the section', () => {
    // The honest fix is a truthful frame, not a smaller site. If somebody
    // removes a card to make this file pass, that is a different change and
    // this is where they are asked to think about it.
    expect(QUOTES).toHaveLength(3);

    for (const locale of LOCALES) expect(pagesCopy(locale).cases).toHaveLength(3);
  });
});
